const fs = require("fs");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env.e2e.local"),
});

const db = process.env.VMB_E2E_DB;
if (!db) {
  console.error("[VMB] VMB_E2E_DB not set in .env.e2e.local (or env)");
  process.exit(1);
}

function getSchemaPath() {
  // Allow override
  if (process.env.VMB_SCHEMA_PATH) return process.env.VMB_SCHEMA_PATH;

  // Common repo locations (adjust if yours differs)
  const candidates = [
    path.resolve(__dirname, "..", "mysql_schema.sql"),
    path.resolve(__dirname, "..", "server", "mysql_schema.sql"),
    path.resolve(__dirname, "..", "db", "mysql_schema.sql"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function splitSqlStatements(sql) {
  // Simple splitter (good enough for typical schema files)
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  // Use mysql2 directly so we can connect WITHOUT selecting a database
  const mysql = require("mysql2/promise");

  const host = process.env.MYSQL_HOST || "127.0.0.1";
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = process.env.MYSQL_USER || "root";
  const password = process.env.MYSQL_PASSWORD || "";

  console.log(`[VMB] wiping database: ${db}`);

  // 1) Connect WITHOUT database
  const adminConn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
  });

  // Drop + create
  await adminConn.query(`DROP DATABASE IF EXISTS \`${db}\``);
  await adminConn.query(`CREATE DATABASE \`${db}\``);

  await adminConn.end();

  // 2) Apply schema (connect WITH database now that it exists)
  const schemaPath = getSchemaPath();
  if (!schemaPath) {
    console.log("[VMB] no schema file found (skipping schema apply)");
    console.log("[VMB] done");
    return;
  }

  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const statements = splitSqlStatements(schemaSql);

  const dbConn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: db,
    multipleStatements: true,
  });

  let applied = 0;
  for (const stmt of statements) {
    await dbConn.query(stmt);
    applied++;
  }

  await dbConn.end();

  console.log(`[VMB] schema applied (${applied} statements)`);
  console.log("[VMB] done");
}

main().catch((err) => {
  console.error("[VMB] clean failed:", err?.message || err);
  process.exit(1);
});
