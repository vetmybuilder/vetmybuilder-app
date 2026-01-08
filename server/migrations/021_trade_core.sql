-- Core: roles + base tradesman profile (no ALTER TABLE usage)

CREATE TABLE IF NOT EXISTS user_roles (
  uid TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user'         -- 'user' | 'tradesman' | 'admin'
);

CREATE TABLE IF NOT EXISTS tradesmen (
  user_id TEXT PRIMARY KEY,                 -- Firebase uid
  company_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  trade_types TEXT DEFAULT '',              -- comma-separated for now
  service_areas TEXT DEFAULT '',            -- comma-separated for now
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  subscription_status TEXT DEFAULT 'free',  -- free | trial | pro
  contact_credits INTEGER DEFAULT 0
);

CREATE TRIGGER IF NOT EXISTS trg_tradesmen_updated
AFTER UPDATE ON tradesmen
BEGIN
  UPDATE tradesmen SET updated_at = datetime('now') WHERE user_id = NEW.user_id;
END;

CREATE INDEX IF NOT EXISTS idx_tradesmen_service_areas ON tradesmen(service_areas);
CREATE INDEX IF NOT EXISTS idx_tradesmen_trade_types   ON tradesmen(trade_types);
