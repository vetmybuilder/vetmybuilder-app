"use strict";

const fs = require("fs");
const path = require("path");

function getDbMode() {
  const sqliteEnabled = process.env.SQLITE_ENABLED;
  const mysqlHost = process.env.MYSQL_HOST || process.env.TEST_DB_HOST;

  if (sqliteEnabled === "0" || sqliteEnabled === "false") return "mysql";
  if (sqliteEnabled === "1" || sqliteEnabled === "true") return "sqlite";
  if (mysqlHost) return "mysql";
  return "sqlite";
}

async function deleteSimDataMysql(recIds) {
  const mysql2 = require("mysql2/promise");

  const conn = await mysql2.createConnection({
    host: process.env.MYSQL_HOST || process.env.TEST_DB_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || process.env.TEST_DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.TEST_DB_USER || "root",
    password: process.env.MYSQL_PASSWORD || process.env.TEST_DB_PASSWORD || "",
    database:
      process.env.MYSQL_DATABASE ||
      process.env.TEST_DB_NAME ||
      "vetmybuilder_test_s1_4_w0",
    multipleStatements: true,
  });

  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    // Delete likes on known recommendation IDs
    if (recIds.length > 0) {
      await conn.query(
        "DELETE FROM recommendation_votes WHERE recommendation_id IN (?)",
        [recIds]
      );
    }

    // Delete builder interest rows (fromUid) and any remaining sim rec IDs
    await conn.query(
      "DELETE FROM tradesman_interests WHERE fromUid LIKE 'sim-%'"
    );
    // Delete neighbour-submitted recommendations (recommenderUserId = sim-neighbour-*)
    await conn.query(
      "DELETE FROM recommendations WHERE recommenderUserId LIKE 'sim-%'"
    );
    if (recIds.length > 0) {
      await conn.query("DELETE FROM recommendations WHERE id IN (?)", [recIds]);
    }

    // Delete tradesman profiles (PK is user_id)
    await conn.query("DELETE FROM tradesmen WHERE user_id LIKE 'sim-%'");

    // Delete user roles and user rows
    await conn.query("DELETE FROM user_roles WHERE uid LIKE 'sim-%'");
    await conn.query("DELETE FROM users WHERE uid LIKE 'sim-%'");

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await conn.end();
  }
}

function deleteSimDataSqlite(recIds) {
  const dbPath =
    process.env.SQLITE_DB_PATH ||
    path.resolve(process.cwd(), "./data/app.db");

  if (!fs.existsSync(dbPath)) {
    console.log(`  (SQLite DB not found at ${dbPath} — skipping DB cleanup)`);
    return;
  }

  const Database = require("better-sqlite3");
  const db = new Database(dbPath);

  try {
    db.pragma("foreign_keys = OFF");

    if (recIds.length > 0) {
      const placeholders = recIds.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM recommendation_votes WHERE recommendation_id IN (${placeholders})`
      ).run(...recIds);
      db.prepare(
        `DELETE FROM recommendations WHERE id IN (${placeholders})`
      ).run(...recIds);
    }

    db.prepare(
      "DELETE FROM tradesman_interests WHERE fromUid LIKE 'sim-%'"
    ).run();
    db.prepare(
      "DELETE FROM recommendations WHERE recommenderUserId LIKE 'sim-%'"
    ).run();
    db.prepare("DELETE FROM tradesmen WHERE user_id LIKE 'sim-%'").run();
    db.prepare("DELETE FROM user_roles WHERE uid LIKE 'sim-%'").run();
    db.prepare("DELETE FROM users WHERE uid LIKE 'sim-%'").run();

    db.pragma("foreign_keys = ON");
  } finally {
    db.close();
  }
}

async function deleteSimData(recIds) {
  const mode = getDbMode();
  console.log(`  DB mode: ${mode}`);

  if (mode === "mysql") {
    await deleteSimDataMysql(recIds);
  } else {
    deleteSimDataSqlite(recIds);
  }
}

module.exports = { deleteSimData };
