// server/boot/ensureAdminTables.js
module.exports = function ensureAdminTables(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tradesmen_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,          -- the tradesman (t.user_id)
      created_by TEXT NOT NULL,       -- admin/mod uid
      reason TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info', -- info | warn | block
      resolved INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_flags_user ON tradesmen_flags(user_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_flags_open ON tradesmen_flags(user_id,resolved)`).run();
};
