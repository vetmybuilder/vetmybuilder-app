-- Marketing/USP layer: offers, warranties, service options, payment methods

/* 1) Promotional offers (discounts, perks, bundles, finance promos) */
CREATE TABLE IF NOT EXISTS tradesmen_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                      -- 'discount','bundle','perk','cashback','finance','other'
  title TEXT NOT NULL,
  description TEXT,
  value_type TEXT,                         -- 'percent','amount','text'
  value_numeric REAL,
  value_currency TEXT DEFAULT 'GBP',
  min_spend INTEGER,                       -- pennies
  coupon_code TEXT,
  valid_from TEXT,
  valid_until TEXT,
  new_customers_only INTEGER DEFAULT 0,    -- 0/1
  limited_quantity INTEGER DEFAULT 0,      -- 0/1
  quantity_remaining INTEGER,
  terms_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,    -- 0/1
  priority INTEGER NOT NULL DEFAULT 0,     -- higher shows first
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trd_offers_user ON tradesmen_offers(user_id);
CREATE INDEX IF NOT EXISTS idx_trd_offers_active ON tradesmen_offers(is_active, valid_until, priority);

CREATE TRIGGER IF NOT EXISTS trg_trd_offers_updated
AFTER UPDATE ON tradesmen_offers
BEGIN
  UPDATE tradesmen_offers SET updated_at = datetime('now') WHERE id = NEW.id;
END;

/* 2) Warranties / guarantees */
CREATE TABLE IF NOT EXISTS tradesmen_warranties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  coverage_text TEXT NOT NULL,             -- e.g. "Workmanship warranty"
  duration_months INTEGER,                 -- e.g. 12, 24, 60
  transferable INTEGER DEFAULT 0,          -- 0/1
  terms_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,    -- 0/1
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trd_warr_user ON tradesmen_warranties(user_id);

CREATE TRIGGER IF NOT EXISTS trg_trd_warr_updated
AFTER UPDATE ON tradesmen_warranties
BEGIN
  UPDATE tradesmen_warranties SET updated_at = datetime('now') WHERE id = NEW.id;
END;

/* 3) Service options (operational promises) */
CREATE TABLE IF NOT EXISTS tradesmen_service_options (
  user_id TEXT PRIMARY KEY,
  emergency_service INTEGER DEFAULT 0,     -- 0/1
  free_quotes INTEGER DEFAULT 1,           -- 0/1
  callout_fee_pennies INTEGER,             -- e.g. 4500 = £45.00
  response_sla_hours INTEGER,              -- target first-response
  finance_available INTEGER DEFAULT 0,     -- 0/1
  hours_json TEXT,                         -- JSON blob for opening hours
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS trg_trd_svc_updated
AFTER UPDATE ON tradesmen_service_options
BEGIN
  UPDATE tradesmen_service_options SET updated_at = datetime('now') WHERE user_id = NEW.user_id;
END;

/* 4) Payment methods accepted */
CREATE TABLE IF NOT EXISTS tradesmen_payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL,                    -- 'visa','mastercard','amex','bank_transfer','cash','apple_pay','klarna','paypal','other'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trd_pay_user ON tradesmen_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_trd_pay_method ON tradesmen_payment_methods(method);

/* Convenience view for reading key marketing bits in one go */
CREATE VIEW IF NOT EXISTS vw_tradesmen_marketing AS
SELECT 
  t.user_id,
  s.emergency_service,
  s.free_quotes,
  s.callout_fee_pennies,
  s.response_sla_hours,
  s.finance_available,
  s.hours_json,
  o.id AS offer_id,
  o.kind AS offer_kind,
  o.title AS offer_title,
  o.value_type,
  o.value_numeric,
  o.value_currency,
  o.valid_until
FROM tradesmen t
LEFT JOIN tradesmen_service_options s ON s.user_id = t.user_id
LEFT JOIN tradesmen_offers o
  ON o.user_id = t.user_id
 AND o.is_active = 1
LEFT JOIN (
  SELECT user_id, MAX(priority) AS maxp 
  FROM tradesmen_offers 
  WHERE is_active = 1 
  GROUP BY user_id
) p ON p.user_id = t.user_id AND o.priority = p.maxp;
