// scripts/dev-manual-clean.js
/* eslint-disable no-console */
require("dotenv").config({ path: ".env.e2e.local" });

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { logger } = require("../server/lib/logger");

const db = process.env.VMB_E2E_DB;
if (!db) {
  logger.error("[VMB] VMB_E2E_DB not set in .env.e2e.local");
  process.exit(1);
}

function mustEnv(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`[VMB] Missing env var: ${name}`);
  return v;
}

function findSchemaFile() {
  const root = path.resolve(__dirname, "..");
  const candidates = [
    path.join(root, "mysql_schema.sql"),
    path.join(root, "server", "mysql_schema.sql"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  // Use your TEST_DB_* vars if present, otherwise fall back to common locals
  const host = mustEnv("TEST_DB_HOST", process.env.MYSQL_HOST || "127.0.0.1");
  const port = Number(
    mustEnv("TEST_DB_PORT", process.env.MYSQL_PORT || "3306"),
  );
  const user = mustEnv("TEST_DB_USER", process.env.MYSQL_USER || "root");
  const password =
    process.env.TEST_DB_PASSWORD || process.env.MYSQL_PASSWORD || "";

  const schemaPath = findSchemaFile();
  if (!schemaPath) {
    logger.error(
      "[VMB] Could not find mysql_schema.sql (checked repo root + server/).",
    );
    process.exit(1);
  }

  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  logger.info(`[VMB] wiping database: ${db}`);
  logger.info(`[VMB] applying schema from: ${schemaPath}`);

  // 1) Drop + recreate DB (no database selected yet)
  const adminConn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
  });

  await adminConn.query(`DROP DATABASE IF EXISTS \`${db}\``);
  await adminConn.query(`CREATE DATABASE \`${db}\``);
  await adminConn.end();

  // 2) Apply schema to the newly created DB
  const dbConn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: db,
    multipleStatements: true,
  });

  await dbConn.query(schemaSql);
  await dbConn.end();

  logger.info("[VMB] done (db wiped + schema applied)");
}

main().catch((err) => {
  logger.error({ err: err?.message || err }, "[VMB] clean failed");
  process.exit(1);
});
