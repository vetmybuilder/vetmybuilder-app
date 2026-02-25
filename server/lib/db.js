const fs = require("fs");
const path = require("path");

function truthy(v) {
  return v === true || v === "1" || v === "true" || v === "yes";
}

/**
 * SQLite is only used for local/dev convenience.
 * In Docker/E2E we disable it by default to avoid native module issues.
 */
function isSqliteEnabled() {
  // Explicit ON wins
  if (truthy(process.env.SQLITE_ENABLED)) return true;

  // Explicit OFF wins
  if (
    process.env.SQLITE_ENABLED === "0" ||
    process.env.SQLITE_ENABLED === "false"
  )
    return false;

  // Default: disable in docker/CI/e2e
  if (
    truthy(process.env.DOCKER) ||
    truthy(process.env.CI) ||
    process.env.TEST_ENV === "e2e"
  )
    return false;

  // Otherwise allow for local dev
  return true;
}

function initDb(dbUrl) {
  if (!isSqliteEnabled()) {
    return null;
  }

  // Lazy require so Docker never needs the native module when disabled
  const Database = require("better-sqlite3");

  const resolved = path.resolve(process.cwd(), dbUrl || "./data/app.db");
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(resolved);
  db.pragma("journal_mode = WAL");
  return db;
}

module.exports = { initDb };
