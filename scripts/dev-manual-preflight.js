// scripts/dev-manual-preflight.js
const net = require("net");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { logger } = require("../server/lib/logger");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env.e2e.local"),
});

// Ports dev:manual owns
const PORTS = [3000, 3100, 3101, 3102, 3103, 9099, 4000, 4400];

// The 4 shard databases dev:manual uses (matching dev-manual-server.js naming)
const DB_PREFIX = (process.env.TEST_DB_NAME_PREFIX || "vetmybuilder_test").trim();
const SHARD_DBS = [0, 1, 2, 3].map(
  (i) => `${DB_PREFIX}_s${i + 1}_4_w${i}`
);

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (open) => {
      try {
        socket.destroy();
      } catch {}
      resolve(open);
    };

    socket.setTimeout(350);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

function killPort(port) {
  const cmd = `lsof -ti tcp:${port} | xargs -r kill -9`;
  spawnSync("sh", ["-lc", cmd], { stdio: "ignore" });
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

(async () => {
  // Opt-out for ad-hoc testing: when SKIP_DB_WIPE=1 we leave the shard
  // databases (and the sim state) alone so the user can verify that
  // their data persists across `npm run dev:manual` restarts. Default
  // behaviour (no flag) still wipes + re-applies the schema, which is
  // what dev:manual / E2E rely on for a clean slate.
  const skipDbWipe = process.env.SKIP_DB_WIPE === "1";

  // ---- 0. Clear sim state (DB is about to be wiped, state will be stale) ----
  // Skip during E2E — tests manage their own state. Also skip when the
  // user opted into SKIP_DB_WIPE - sim state belongs with the DB.
  if (process.env.TEST_ENV !== "e2e" && !process.env.CI && !skipDbWipe) {
    const simStatePath = path.resolve(__dirname, "../.sim-state.json");
    if (fs.existsSync(simStatePath)) {
      fs.unlinkSync(simStatePath);
      logger.info("Cleared stale .sim-state.json");
    }
  }

  // ---- 1. Kill stale processes ----
  const stale = [];
  for (const p of PORTS) {
    if (await isPortOpen(p)) stale.push(p);
  }

  if (stale.length) {
    logger.warn({ ports: stale }, "Killing stale processes");
    for (const p of stale) killPort(p);
  } else {
    logger.info("No stale dev processes detected");
  }

  // ---- 2. Wipe + recreate all shard databases ----
  if (skipDbWipe) {
    logger.warn(
      "SKIP_DB_WIPE=1 — preserving existing shard databases. " +
        "Unset this flag to restore the standard wipe-on-start behaviour.",
    );
    process.exit(0);
  }

  const schemaPath = findSchemaFile();
  if (!schemaPath) {
    logger.error(
      "Could not find mysql_schema.sql — skipping DB reset. Checked repo root and server/"
    );
    process.exit(0);
  }

  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const host =
    process.env.TEST_DB_HOST || process.env.MYSQL_HOST || "127.0.0.1";
  const port = Number(
    process.env.TEST_DB_PORT || process.env.MYSQL_PORT || 3306
  );
  const user =
    process.env.TEST_DB_USER || process.env.MYSQL_USER || "root";
  const password =
    process.env.TEST_DB_PASSWORD ||
    process.env.MYSQL_PASSWORD ||
    process.env.MYSQL_ROOT_PASSWORD ||
    "";

  let adminConn;
  try {
    adminConn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });
  } catch (e) {
    logger.warn(
      { err: e?.message },
      "Cannot connect to MySQL — skipping DB reset (is MySQL running?)"
    );
    process.exit(0);
  }

  // Read the migration filenames once so each freshly-applied schema can
  // be marked at "latest" in _migrations. mysql_schema.sql is the
  // canonical snapshot - it already contains every column/table that
  // incremental migrations would add - so re-running 001+ against a
  // wiped+seeded DB would fail with "Duplicate column" errors. Stamping
  // them as already applied keeps the bookkeeping consistent with what
  // the schema actually is.
  const migrationsDir = path.resolve(__dirname, "..", "server", "migrations");
  let migrationFiles = [];
  try {
    migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));
  } catch (e) {
    logger.warn(
      { err: e?.message, migrationsDir },
      "Could not list migration files - _migrations will be empty after wipe",
    );
  }

  for (const db of SHARD_DBS) {
    try {
      await adminConn.query(`DROP DATABASE IF EXISTS \`${db}\``);
      await adminConn.query(`CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await adminConn.query(`USE \`${db}\``);
      await adminConn.query(schemaSql);
      for (const name of migrationFiles) {
        await adminConn.query(
          "INSERT IGNORE INTO _migrations (name, appliedAt) VALUES (?, NOW())",
          [name],
        );
      }
      logger.info({ db, migrationsRecorded: migrationFiles.length }, "DB wiped and schema applied");
    } catch (e) {
      logger.error({ db, err: e?.message }, "Failed to reset DB");
    }
  }

  await adminConn.end();
  logger.info({ databases: SHARD_DBS }, "All shard databases reset");

  process.exit(0);
})();
