// server/lib/migrate.js
const fs = require("fs");
const path = require("path");

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      appliedAt TEXT NOT NULL
    );
  `);
}

function getApplied(db) {
  const rows = db.prepare("SELECT name FROM _migrations ORDER BY name").all();
  return new Set(rows.map((r) => r.name));
}

function applyOne(db, name, sql) {
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

    // Case 1: adding a column that's already there
    if (msg.includes("duplicate column name")) {
      db.prepare(
        "INSERT OR IGNORE INTO _migrations(name, appliedAt) VALUES(?, ?)"
      ).run(name, new Date().toISOString());
      console.warn("[migrate] skipped (already applied):", name);
      return;
    }

    // Case 2: that flaky view referencing recommendations before it's available
    // e.g. "SqliteError: error in view v_recommendation_scores: no such table: main.recommendations"
    if (
      /error in view\s+v_recommendation_scores/i.test(msg) &&
      /no such table:\s*main\.recommendations/i.test(msg)
    ) {
      db.prepare(
        "INSERT OR IGNORE INTO _migrations(name, appliedAt) VALUES(?, ?)"
      ).run(name, new Date().toISOString());
      console.warn(
        "[migrate] skipped view creation in",
        name,
        "(recommendations missing at apply time)"
      );
      return;
    }

    // Anything else: rethrow
    throw e;
  }
}

function columnExists(db, table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function runMigrations(
  db,
  dir = path.resolve(process.cwd(), "server", "migrations")
) {
  ensureMigrationsTable(db);
  if (!fs.existsSync(dir)) {
    console.log("[migrate] dir not found, nothing to run:", dir);
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = getApplied(db);

  for (const file of files) {
    if (applied.has(file)) continue;

    let sql = fs.readFileSync(path.join(dir, file), "utf8");

    // Heuristic: if this migration adds 'status' to 'projects' and it exists, pre-skip.
    if (
      /ALTER\s+TABLE\s+projects\s+ADD\s+COLUMN\s+status/i.test(sql) &&
      columnExists(db, "projects", "status")
    ) {
      db.prepare(
        "INSERT OR IGNORE INTO _migrations(name, appliedAt) VALUES(?, ?)"
      ).run(file, new Date().toISOString());
      console.warn("[migrate] pre-skip (column exists):", file);
      continue;
    }

    applyOne(db, file, sql);
  }

  console.log("[migrate] up to date");
}

module.exports = { runMigrations };


// const fs = require("fs");
// const path = require("path");

// function ensureMigrationsTable(db) {
//   db.exec(`
//     CREATE TABLE IF NOT EXISTS _migrations (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       name TEXT NOT NULL UNIQUE,
//       appliedAt TEXT NOT NULL
//     );
//   `);
// }

// function getApplied(db) {
//   const rows = db.prepare("SELECT name FROM _migrations ORDER BY name").all();
//   return new Set(rows.map((r) => r.name));
// }

// function applyOne(db, name, sql) {
//   try {
//     const tx = db.transaction(() => {
//       db.exec(sql);
//       db.prepare("INSERT INTO _migrations(name, appliedAt) VALUES(?, ?)").run(
//         name,
//         new Date().toISOString()
//       );
//     });
//     tx();
//   } catch (e) {
//     const msg = String(e);
//     // If the migration attempted to add a column that already exists, mark as applied and continue.
//     if (msg.includes("duplicate column name")) {
//       db.prepare(
//         "INSERT OR IGNORE INTO _migrations(name, appliedAt) VALUES(?, ?)"
//       ).run(name, new Date().toISOString());
//       console.warn("[migrate] skipped (already applied):", name);
//       return;
//     }
//     throw e;
//   }
// }

// function columnExists(db, table, column) {
//   const rows = db.prepare(`PRAGMA table_info(${table})`).all();
//   return rows.some((r) => r.name === column);
// }

// function runMigrations(
//   db,
//   dir = path.resolve(process.cwd(), "server", "migrations")
// ) {
//   ensureMigrationsTable(db);
//   if (!fs.existsSync(dir)) return;

//   const files = fs
//     .readdirSync(dir)
//     .filter((f) => f.endsWith(".sql"))
//     .sort();
//   const applied = getApplied(db);

//   for (const file of files) {
//     if (applied.has(file)) continue;
//     let sql = fs.readFileSync(path.join(dir, file), "utf8");

//     // Tiny heuristic: if this migration adds "status" to "projects" and it already exists, skip.
//     if (
//       /ALTER\s+TABLE\s+projects\s+ADD\s+COLUMN\s+status/i.test(sql) &&
//       columnExists(db, "projects", "status")
//     ) {
//       db.prepare(
//         "INSERT OR IGNORE INTO _migrations(name, appliedAt) VALUES(?, ?)"
//       ).run(file, new Date().toISOString());
//       console.warn("[migrate] pre-skip (column exists):", file);
//       continue;
//     }

//     applyOne(db, file, sql);
//   }
//   console.log("[migrate] up to date");
// }

// module.exports = { runMigrations };
