// scripts/check-schema-drift.js
//
// Verifies that running every migration in server/migrations/ produces
// the same schema as the canonical snapshot in mysql_schema.sql. Used as
// a CI guardrail: if someone adds a migration but forgets to update
// mysql_schema.sql (or vice versa), this job fails the PR.
//
// How it works:
//   1. Create two ephemeral MySQL databases.
//   2. Apply every migration file to one ("migrated").
//   3. Apply mysql_schema.sql to the other ("canonical").
//   4. Compare INFORMATION_SCHEMA.COLUMNS between the two.
//   5. Exit non-zero if any table/column drifts.
//
// Run locally:
//   MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=... \
//     node scripts/check-schema-drift.js
//
// Connection env: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD.
// The script creates and drops its own DBs - it does NOT touch any
// existing one.

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

const MIGRATIONS_DIR = path.join(__dirname, "..", "server", "migrations");
const CANONICAL_PATH = path.join(__dirname, "..", "mysql_schema.sql");

const MIGRATED_DB = "_schema_drift_migrated";
const CANONICAL_DB = "_schema_drift_canonical";

function connectOpts(database) {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database,
    multipleStatements: true,
  };
}

async function recreateDatabase(adminConn, name) {
  await adminConn.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await adminConn.query(
    `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
}

async function applyMigrations(conn) {
  const files = (await fs.promises.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    throw new Error("no migration files found in server/migrations/");
  }
  for (const name of files) {
    const sql = await fs.promises.readFile(
      path.join(MIGRATIONS_DIR, name),
      "utf8",
    );
    try {
      await conn.query(sql);
    } catch (err) {
      throw new Error(`migration ${name} failed: ${err.message}`);
    }
  }
}

async function applyCanonical(conn) {
  const sql = await fs.promises.readFile(CANONICAL_PATH, "utf8");
  try {
    await conn.query(sql);
  } catch (err) {
    throw new Error(`canonical mysql_schema.sql failed to apply: ${err.message}`);
  }
}

async function snapshotColumns(conn, database) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [database],
  );
  // Index by "table.column" for set arithmetic later.
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.TABLE_NAME}.${r.COLUMN_NAME}`;
    byKey.set(key, {
      type: String(r.COLUMN_TYPE),
      nullable: String(r.IS_NULLABLE),
      default: r.COLUMN_DEFAULT,
      key: String(r.COLUMN_KEY),
      extra: String(r.EXTRA),
    });
  }
  return byKey;
}

function compareSnapshots(migrated, canonical) {
  const issues = [];

  // Columns present in migrated but missing in canonical
  for (const key of migrated.keys()) {
    if (!canonical.has(key)) {
      issues.push({
        kind: "extra_in_migrated",
        column: key,
        detail: "exists in migrations but not in mysql_schema.sql",
      });
    }
  }

  // Columns present in canonical but missing in migrated
  for (const key of canonical.keys()) {
    if (!migrated.has(key)) {
      issues.push({
        kind: "missing_in_migrated",
        column: key,
        detail: "exists in mysql_schema.sql but no migration creates it",
      });
    }
  }

  // Columns in both, but with different definitions
  for (const [key, mDef] of migrated.entries()) {
    const cDef = canonical.get(key);
    if (!cDef) continue;
    const diffs = [];
    if (mDef.type !== cDef.type) {
      diffs.push(`type: migrated=${mDef.type}, canonical=${cDef.type}`);
    }
    if (mDef.nullable !== cDef.nullable) {
      diffs.push(
        `nullable: migrated=${mDef.nullable}, canonical=${cDef.nullable}`,
      );
    }
    // COLUMN_DEFAULT comparison is loose - MySQL normalises differently
    // for the same logical value (e.g. NULL vs literal NULL). Compare
    // stringified.
    const mDefault = mDef.default == null ? "NULL" : String(mDef.default);
    const cDefault = cDef.default == null ? "NULL" : String(cDef.default);
    if (mDefault !== cDefault) {
      diffs.push(
        `default: migrated=${mDefault}, canonical=${cDefault}`,
      );
    }
    if (mDef.extra !== cDef.extra) {
      diffs.push(`extra: migrated=${mDef.extra}, canonical=${cDef.extra}`);
    }
    if (diffs.length) {
      issues.push({
        kind: "definition_mismatch",
        column: key,
        detail: diffs.join("; "),
      });
    }
  }

  return issues;
}

async function main() {
  // Admin connection (no specific DB) to create + drop the ephemeral ones.
  const admin = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    multipleStatements: true,
  });

  let migratedConn;
  let canonicalConn;
  try {
    await recreateDatabase(admin, MIGRATED_DB);
    await recreateDatabase(admin, CANONICAL_DB);

    migratedConn = await mysql.createConnection(connectOpts(MIGRATED_DB));
    canonicalConn = await mysql.createConnection(connectOpts(CANONICAL_DB));

    console.log("[schema-drift] applying migrations...");
    await applyMigrations(migratedConn);

    console.log("[schema-drift] applying canonical mysql_schema.sql...");
    await applyCanonical(canonicalConn);

    const migrated = await snapshotColumns(migratedConn, MIGRATED_DB);
    const canonical = await snapshotColumns(canonicalConn, CANONICAL_DB);

    const issues = compareSnapshots(migrated, canonical);

    if (issues.length === 0) {
      console.log(
        `[schema-drift] OK - ${migrated.size} columns match across ${new Set([...migrated.keys()].map((k) => k.split(".")[0])).size} tables`,
      );
      return 0;
    }

    console.error(`[schema-drift] FAIL - ${issues.length} drift issue(s):\n`);
    for (const issue of issues) {
      console.error(`  - [${issue.kind}] ${issue.column}: ${issue.detail}`);
    }
    console.error(
      "\n[schema-drift] Resolution:",
    );
    console.error(
      "  - extra_in_migrated:    update mysql_schema.sql so it includes this column",
    );
    console.error(
      "  - missing_in_migrated:  add a NNN_*.sql file that creates this column",
    );
    console.error(
      "  - definition_mismatch:  reconcile the column's type/nullable/default between the two sources",
    );
    return 1;
  } finally {
    if (migratedConn) try { await migratedConn.end(); } catch {}
    if (canonicalConn) try { await canonicalConn.end(); } catch {}
    try {
      await admin.query(`DROP DATABASE IF EXISTS \`${MIGRATED_DB}\``);
      await admin.query(`DROP DATABASE IF EXISTS \`${CANONICAL_DB}\``);
    } catch {}
    try { await admin.end(); } catch {}
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[schema-drift] runner failed:", err?.message || err);
    process.exit(2);
  });
