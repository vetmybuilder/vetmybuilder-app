// server/lib/migrate.js
//
// MySQL migration runner. Applies any numbered SQL file in
// server/migrations/ that hasn't already been recorded in the
// _migrations bookkeeping table. Runs once on server boot.
//
// File naming: NNN_description.sql where NNN is a zero-padded integer.
// Files are applied in sorted filename order, so always pick a number
// higher than every existing file when adding a new one.
//
// Why a dedicated connection: the main pool runs with multipleStatements
// disabled (defence against SQLi). Migration files contain many CREATE
// TABLE / ALTER statements separated by semicolons, so we open a
// short-lived connection with multipleStatements:true just for this
// startup step, then close it. Production traffic continues to use the
// safer pool.
//
// First-run on existing prod data: if _migrations is empty AND the DB
// already contains app tables (we check for `projects` as the canary),
// the runner assumes this is a legacy install that pre-dates the
// migration system. It records the baseline (000) as "already applied"
// WITHOUT executing it, so we don't try to CREATE TABLE on existing
// tables and crash. Future numbered files apply normally from there.

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function openMigrationConnection() {
  // Reuses the same env vars the main pool reads, but opts into
  // multipleStatements for the duration of the migration run.
  return mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true,
  });
}

async function ensureMigrationsTable(conn) {
  // Schema matches what mysql_schema.sql declares so fresh installs and
  // existing ones agree. `appliedAt` is camelCase here (legacy from the
  // SQLite-era runner) - we keep it rather than rename across every
  // existing install just to satisfy a naming convention.
  await conn.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
       name VARCHAR(255) NOT NULL UNIQUE,
       appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
}

async function listMigrationFiles() {
  const all = await fs.promises.readdir(MIGRATIONS_DIR);
  return all
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function listAppliedMigrations(conn) {
  const [rows] = await conn.query("SELECT name FROM _migrations");
  return new Set(rows.map((r) => r.name));
}

async function hasLegacyAppTables(conn) {
  // `projects` is one of the oldest core tables - if it exists in this
  // schema, the DB pre-dates the migration system.
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'projects'
      LIMIT 1`,
  );
  return rows.length > 0;
}

async function recordWithoutRunning(conn, name) {
  await conn.query(
    "INSERT IGNORE INTO _migrations (name, appliedAt) VALUES (?, NOW())",
    [name],
  );
}

async function applyFile(conn, name, log) {
  const fullPath = path.join(MIGRATIONS_DIR, name);
  const sql = await fs.promises.readFile(fullPath, "utf8");
  log.info?.(`[migrate] applying ${name}`);
  await conn.query(sql);
  await conn.query(
    "INSERT INTO _migrations (name, appliedAt) VALUES (?, NOW())",
    [name],
  );
  log.info?.(`[migrate] applied  ${name}`);
}

async function runMigrations(log = console) {
  // Allow opt-out for environments that manage schema externally
  // (e.g. tests that ship a pre-baked DB).
  if (process.env.SKIP_MIGRATIONS === "1") {
    log.info?.("[migrate] SKIP_MIGRATIONS=1 - skipping");
    return;
  }

  let conn;
  try {
    conn = await openMigrationConnection();
    await ensureMigrationsTable(conn);

    const files = await listMigrationFiles();
    if (files.length === 0) {
      log.info?.("[migrate] no migration files found");
      return;
    }

    const applied = await listAppliedMigrations(conn);

    // First-boot special case: existing prod DB has no _migrations rows
    // but already has app tables. Mark every file up to and including
    // 000_baseline.sql as applied without running them. Subsequent
    // numbered files apply normally.
    if (applied.size === 0 && (await hasLegacyAppTables(conn))) {
      log.info?.(
        "[migrate] existing schema detected - recording baseline as applied without executing",
      );
      const baseline = files.find((f) => f.startsWith("000_"));
      if (baseline) {
        await recordWithoutRunning(conn, baseline);
        applied.add(baseline);
      }
    }

    let appliedCount = 0;
    for (const name of files) {
      if (applied.has(name)) continue;
      await applyFile(conn, name, log);
      appliedCount += 1;
    }

    if (appliedCount === 0) {
      log.info?.("[migrate] schema up to date");
    } else {
      log.info?.(`[migrate] applied ${appliedCount} migration(s)`);
    }
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
  }
}

module.exports = { runMigrations };
