// server/lib/migrate.js
const fs = require("fs");
const path = require("path");

const TAG = "[migrate]";

// ----------------------------
// Logger (fallback to console)
// ----------------------------
function makeLogger(ctx) {
  const base = ctx?.log || console;
  return {
    info: (...a) => base.info(...a),
    warn: (...a) => base.warn(...a),
    error: (...a) => base.error(...a),
  };
}

// db is passed in server/index.js → runMigrations(db)
function isSqliteDb(db) {
  return (
    db && typeof db.exec === "function" && typeof db.prepare === "function"
  );
}

function ensureMigrationsTable(db, log) {
  if (!isSqliteDb(db)) {
    log.warn(`${TAG} skipping migrations: non-SQLite db (no exec/prepare)`);
    return false;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      appliedAt TEXT NOT NULL
    );
  `);

  return true;
}

function getApplied(db) {
  if (!isSqliteDb(db)) return new Set();
  const rows = db.prepare("SELECT name FROM _migrations ORDER BY name").all();
  return new Set(rows.map((r) => r.name));
}

function applyOne(db, name, sql, log) {
  if (!isSqliteDb(db)) {
    log.warn(`${TAG} applyOne called on non-SQLite db, skipping`, { name });
    return;
  }

  try {
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations(name, appliedAt) VALUES(?, ?)").run(
        name,
        new Date().toISOString()
      );
    });
    tx();
  } catch (e) {
    const msg = String(e || "");

    // Column already exists → skip
    if (msg.includes("duplicate column name")) {
      db.prepare(
        "INSERT OR IGNORE INTO _migrations(name, appliedAt) VALUES(?, ?)"
      ).run(name, new Date().toISOString());

      log.warn(`${TAG} skipped (already applied)`, { name });
      return;
    }

    // View creation fails because recommendations table missing
    if (
      /error in view\s+v_recommendation_scores/i.test(msg) &&
      /no such table:\s*main\.recommendations/i.test(msg)
    ) {
      db.prepare(
        "INSERT OR IGNORE INTO _migrations(name, appliedAt) VALUES(?, ?)"
      ).run(name, new Date().toISOString());

      log.warn(`${TAG} skipped view creation (table missing)`, { name });
      return;
    }

    // Unexpected → rethrow
    throw e;
  }
}

function columnExists(db, table, column) {
  if (!isSqliteDb(db)) return false;
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function runMigrations(
  db,
  dir = path.resolve(process.cwd(), "server", "migrations"),
  ctx = {}
) {
  const log = makeLogger(ctx);

  if (!ensureMigrationsTable(db, log)) {
    log.info(`${TAG} non-SQLite DB detected — migrations disabled`);
    return;
  }

  if (!fs.existsSync(dir)) {
    log.info(`${TAG} directory not found — nothing to run`, { dir });
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = getApplied(db);

  for (const file of files) {
    if (applied.has(file)) continue;

    const full = path.join(dir, file);
    const sql = fs.readFileSync(full, "utf8");

    // Pre-skip: adding status column already exists
    if (
      /ALTER\s+TABLE\s+projects\s+ADD\s+COLUMN\s+status/i.test(sql) &&
      columnExists(db, "projects", "status")
    ) {
      db.prepare(
        "INSERT OR IGNORE INTO _migrations(name, appliedAt) VALUES(?, ?)"
      ).run(file, new Date().toISOString());

      log.warn(`${TAG} pre-skip (column exists)`, { file });
      continue;
    }

    applyOne(db, file, sql, log);
  }

  log.info(`${TAG} migrations up to date`);
}

module.exports = { runMigrations };
