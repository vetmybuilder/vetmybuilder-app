// scripts/dev-manual-server.js
const path = require("node:path");
const net = require("node:net");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env.e2e.local"),
});
const { logger } = require("../server/lib/logger");

// -------------------- defaults --------------------
process.env.TEST_ENV = process.env.TEST_ENV || "e2e";
process.env.TEST_TOTAL_SHARDS = process.env.TEST_TOTAL_SHARDS || "4";
process.env.TEST_SHARD = process.env.TEST_SHARD || "0";
process.env.PORT = process.env.PORT || "3100";

// MySQL defaults (match your docker compose / local stack)
process.env.MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
process.env.MYSQL_PORT = process.env.MYSQL_PORT || "3306";
process.env.MYSQL_USER = process.env.MYSQL_USER || "root";

// IMPORTANT: don’t silently run with NO password
// Prefer MYSQL_PASSWORD, fallback to MYSQL_ROOT_PASSWORD (common in compose)
process.env.MYSQL_PASSWORD =
  process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || "";

// If you *explicitly* set MYSQL_DATABASE (or VMB_E2E_DB), we respect it.
// Otherwise derive per-shard DB name:
//   vetmybuilder_test_s{shardIndex+1}_{totalShards}_w{shardIndex}
function resolveMysqlDatabase() {
  const explicit = (
    process.env.MYSQL_DATABASE ||
    process.env.VMB_E2E_DB ||
    ""
  ).trim();
  if (explicit) return explicit;

  const total = Number(process.env.TEST_TOTAL_SHARDS || "4");
  const shardIndex = Number(process.env.TEST_SHARD || "0");

  const safeTotal = Number.isFinite(total) && total > 0 ? total : 4;
  const safeShard =
    Number.isFinite(shardIndex) && shardIndex >= 0 ? shardIndex : 0;

  const prefix = (
    process.env.TEST_DB_NAME_PREFIX || "vetmybuilder_test"
  ).trim();

  return `${prefix}_s${safeShard + 1}_${safeTotal}_w${safeShard}`;
}

process.env.MYSQL_DATABASE = resolveMysqlDatabase();

// -------------------- helpers --------------------
function parseHostPort(value) {
  const [host, portStr] = String(value || "").split(":");
  const port = Number(portStr);
  if (!host || !Number.isFinite(port)) return null;
  return { host, port };
}

function waitForPort({ host, port, timeoutMs = 30_000, intervalMs = 200 }) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const tryConnect = () => {
      const socket = new net.Socket();

      const onError = () => {
        socket.destroy();

        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }

        setTimeout(tryConnect, intervalMs);
      };

      socket.setTimeout(1000);
      socket.once("error", onError);
      socket.once("timeout", onError);

      socket.connect(port, host, () => {
        socket.end();
        resolve();
      });
    };

    tryConnect();
  });
}

// -------------------- run --------------------
(async () => {
  // Wait for Firebase Auth emulator (token minting depends on this)
  const emulator = parseHostPort(
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  );

  if (emulator) {
    logger.info(
      { host: emulator.host, port: emulator.port },
      "[dev-manual-server] waiting for Firebase Auth emulator",
    );
    await waitForPort({ host: emulator.host, port: emulator.port });
    logger.info(
      { host: emulator.host, port: emulator.port },
      "[dev-manual-server] Firebase Auth emulator is ready",
    );
  }

  // Wait for MySQL (prevents early “using password: NO” / connection flaps)
  if (process.env.MYSQL_HOST && process.env.MYSQL_PORT) {
    await waitForPort({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT),
      timeoutMs: 60_000,
    });
  }

  logger.info(
    {
      port: process.env.PORT,
      mysqlHost: process.env.MYSQL_HOST,
      mysqlPort: process.env.MYSQL_PORT,
      mysqlUser: process.env.MYSQL_USER,
      mysqlHasPassword: Boolean(process.env.MYSQL_PASSWORD),
      mysqlDatabase: process.env.MYSQL_DATABASE,
      testEnv: process.env.TEST_ENV,
      totalShards: process.env.TEST_TOTAL_SHARDS,
      shard: process.env.TEST_SHARD,
      authEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || null,
      nextAuthEmulatorHost:
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || null,
      firebaseAdminCredsPresent: Boolean(
        process.env.FIREBASE_ADMIN_CREDENTIALS_JSON,
      ),
    },
    "[dev-manual-server] starting server with env",
  );

  // Start the server
  require("../server/index.js");
})().catch((err) => {
  logger.error({ err }, "[dev-manual-server] failed to start");
  process.exit(1);
});
