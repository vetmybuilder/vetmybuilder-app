// server/lib/mysql.js
const mysql = require("mysql2/promise");

let pool;

/**
 * Initialise (or reuse) a MySQL pool.
 * Call getPool() anywhere you need a DB connection.
 */
function getPool() {
  if (pool) return pool;

  const {
    MYSQL_HOST = "127.0.0.1",
    MYSQL_PORT = 3306,
    MYSQL_USER = "root",
    MYSQL_PASSWORD = "",
    MYSQL_DATABASE = "vetmybuilder",
  } = process.env;

  pool = mysql.createPool({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return pool;
}

/**
 * Simple helper for running queries.
 *
 * Supports BOTH of these call styles:
 *   - query(sql, [param1, param2])
 *   - query(sql, param1, param2)
 */
async function query(sql, ...rest) {
  const conn = getPool();

  let params;
  if (rest.length === 0) {
    params = [];
  } else if (rest.length === 1 && Array.isArray(rest[0])) {
    // query(sql, [a, b, c])
    params = rest[0];
  } else {
    // query(sql, a, b, c)
    params = rest;
  }

  const [rows] = await conn.execute(sql, params);
  return rows;
}

module.exports = {
  getPool,
  query,
};