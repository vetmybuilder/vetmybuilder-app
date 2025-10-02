const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function initDb(dbUrl) {
  const resolved = path.resolve(process.cwd(), dbUrl || './data/app.db');
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  return db;
}

module.exports = { initDb };
