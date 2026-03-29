// server/lib/mysql.js
const mysql = require("mysql2/promise");
const { AsyncLocalStorage } = require("node:async_hooks");

let pool;
const txStore = new AsyncLocalStorage();

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
    multipleStatements: false,
  });

  return pool;
}

function normSql(sql) {
  return String(sql || "")
    .trim()
    .toUpperCase();
}

function isControlStatement(sql) {
  const s = normSql(sql);
  return (
    s === "BEGIN" ||
    s === "START TRANSACTION" ||
    s === "COMMIT" ||
    s === "ROLLBACK" ||
    s.startsWith("SET ") ||
    s.startsWith("USE ")
  );
}

function getTxConn() {
  const store = txStore.getStore();
  return store?.conn || null;
}

async function beginTx() {
  const existing = getTxConn();
  if (existing) return existing;

  const p = getPool();
  const conn = await p.getConnection();

  // Start tx on this pinned connection
  await conn.query("START TRANSACTION");

  // Bind this connection to the current async flow
  txStore.enterWith({ conn });

  return conn;
}

async function endTx(commit) {
  const conn = getTxConn();
  if (!conn) return;

  try {
    if (commit) await conn.query("COMMIT");
    else await conn.query("ROLLBACK");
  } finally {
    try {
      conn.release();
    } catch {}
    // Clear store for this async flow
    txStore.enterWith({});
  }
}

async function runOn(conn, sql, params) {
  const hasParams = Array.isArray(params) && params.length > 0;

  // Control statements must use query(), not execute()
  if (isControlStatement(sql) || !hasParams) {
    const [rows] = await conn.query(sql, params);
    return rows;
  }

  const [rows] = await conn.execute(sql, params);
  return rows;
}

/**
 * Supports:
 *  - query(sql, [a,b])
 *  - query(sql, a, b)
 */
async function query(sql, ...rest) {
  let params;
  if (rest.length === 0) params = [];
  else if (rest.length === 1 && Array.isArray(rest[0])) params = rest[0];
  else params = rest;

  const s = normSql(sql);

  // Transaction control: pin / unpin a connection automatically
  if (s === "BEGIN" || s === "START TRANSACTION") {
    await beginTx();
    return [];
  }

  if (s === "COMMIT") {
    await endTx(true);
    return [];
  }

  if (s === "ROLLBACK") {
    await endTx(false);
    return [];
  }

  const txConn = getTxConn();
  if (txConn) {
    return runOn(txConn, sql, params);
  }

  // No tx -> normal pooled execution
  const p = getPool();
  return runOn(p, sql, params);
}

module.exports = {
  getPool,
  query,
};
