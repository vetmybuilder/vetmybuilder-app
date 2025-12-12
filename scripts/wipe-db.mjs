#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();

import mysql from "mysql2/promise";

/* ---------- simple arg parsing ---------- */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv);

const DB_HOST = args.host || process.env.MYSQL_HOST || "127.0.0.1";
const DB_PORT = Number(args.port || process.env.MYSQL_PORT || 3306);
const DB_USER = args.user || process.env.MYSQL_USER || "root";
const DB_PASS = args.password || process.env.MYSQL_PASSWORD || "";
const DB_NAME =
  args.db || args.database || process.env.MYSQL_DATABASE || "vetmybuilder";

const reallyDelete = Boolean(args.yes);

const EXCLUDED_TABLES = new Set(["users", "user_roles", "_migrations"]);

/* ---------- main ---------- */
(async function main() {
  console.log("MySQL wipe script");
  console.log(`  host: ${DB_HOST}:${DB_PORT}`);
  console.log(`  db:   ${DB_NAME}`);
  console.log(
    `  mode: ${reallyDelete ? "LIVE (data will be deleted)" : "DRY-RUN"}`
  );
  console.log(`  keeping tables: ${Array.from(EXCLUDED_TABLES).join(", ")}`);

  let conn;
  try {
    conn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
      multipleStatements: true,
    });

    const [rows] = await conn.query(
      `
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `,
      [DB_NAME]
    );

    const allTables = rows.map((r) => r.name);
    const targetTables = allTables.filter(
      (t) => !EXCLUDED_TABLES.has(t.toLowerCase())
    );

    console.log("\nAll tables:");
    console.log(" ", allTables.join(", ") || "(none)");

    console.log("\nTables to wipe:");
    console.log(" ", targetTables.join(", ") || "(none)");

    if (!targetTables.length) {
      console.log("\nNothing to wipe. Done.");
      process.exit(0);
    }

    if (!reallyDelete) {
      console.log(
        "\nDRY-RUN complete. Pass --yes to actually delete table data."
      );
      process.exit(0);
    }

    console.log("\nDisabling foreign_key_checks…");
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    for (const table of targetTables) {
      const sql = `TRUNCATE TABLE \`${table}\``;
      console.log(`  -> ${sql}`);
      try {
        await conn.query(sql);
      } catch (e) {
        console.warn(
          `  !! TRUNCATE failed for ${table} (${e?.message}), falling back to DELETE`
        );
        await conn.query(`DELETE FROM \`${table}\``);
      }
    }

    console.log("Re-enabling foreign_key_checks…");
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log("\n✅ Wipe complete.");
    process.exit(0);
  } catch (e) {
    console.error("\n❌ Error:", e?.message || e);
    process.exit(1);
  } finally {
    try {
      await conn?.end();
    } catch {}
  }
})();
