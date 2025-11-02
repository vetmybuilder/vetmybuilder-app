-- Trust/compliance: memberships, insurance, certifications, background checks

/* 1) Memberships / affiliations */
CREATE TABLE IF NOT EXISTS tradesmen_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  organisation TEXT NOT NULL,              -- e.g. "Gas Safe Register", "FMB", "NICEIC"
  membership_id TEXT NOT NULL DEFAULT '',  -- make NOT NULL so we can use UNIQUE without expressions
  membership_level TEXT,
  join_date TEXT,
  expiry_date TEXT,
  website_url TEXT,
  proof_doc_path TEXT,
  verified_status TEXT DEFAULT 'queued',   -- queued|running|verified|expired|failed|manual_ok
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, organisation, membership_id)
);
CREATE INDEX IF NOT EXISTS idx_trm_user ON tradesmen_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_trm_org ON tradesmen_memberships(organisation);
CREATE INDEX IF NOT EXISTS idx_trm_verify ON tradesmen_memberships(verified_status);

CREATE TRIGGER IF NOT EXISTS trg_trm_updated
AFTER UPDATE ON tradesmen_memberships
BEGIN
  UPDATE tradesmen_memberships SET updated_at = datetime('now') WHERE id = NEW.id;
END;

/* 2) Insurance policies */
CREATE TABLE IF NOT EXISTS tradesmen_insurance_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  policy_number TEXT,
  coverage_type TEXT,                      -- 'public_liability','employers_liability','professional_indemnity'
  coverage_amount_pennies INTEGER,
  public_liability_pennies INTEGER,
  employer_liability_pennies INTEGER,
  indemnity_pennies INTEGER,
  issued_on TEXT,
  expires_on TEXT,
  certificate_path TEXT,
  verified_status TEXT DEFAULT 'queued',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tri_user ON tradesmen_insurance_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_tri_expires ON tradesmen_insurance_policies(expires_on);
CREATE INDEX IF NOT EXISTS idx_tri_verify ON tradesmen_insurance_policies(verified_status);

CREATE TRIGGER IF NOT EXISTS trg_tri_updated
AFTER UPDATE ON tradesmen_insurance_policies
BEGIN
  UPDATE tradesmen_insurance_policies SET updated_at = datetime('now') WHERE id = NEW.id;
END;

/* 3) Certifications / licences */
CREATE TABLE IF NOT EXISTS tradesmen_certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  authority TEXT NOT NULL,                 -- issuing body
  name TEXT NOT NULL,                      -- cert/course name
  reference_no TEXT NOT NULL DEFAULT '',   -- NOT NULL so UNIQUE has no expressions
  issued_on TEXT,
  expires_on TEXT,
  badge_url TEXT,
  proof_doc_path TEXT,
  verified_status TEXT DEFAULT 'queued',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, authority, name, reference_no)
);
CREATE INDEX IF NOT EXISTS idx_trc_user ON tradesmen_certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_trc_verify ON tradesmen_certifications(verified_status);

CREATE TRIGGER IF NOT EXISTS trg_trc_updated
AFTER UPDATE ON tradesmen_certifications
BEGIN
  UPDATE tradesmen_certifications SET updated_at = datetime('now') WHERE id = NEW.id;
END;

/* 4) Background checks (optional) */
CREATE TABLE IF NOT EXISTS tradesmen_background_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  check_type TEXT NOT NULL,                -- 'dbs_basic','dbs_enhanced','right_to_work', etc.
  reference_no TEXT,
  result TEXT,                             -- 'clear','notes','failed'
  issued_on TEXT,
  expires_on TEXT,
  proof_doc_path TEXT,
  verified_status TEXT DEFAULT 'queued',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trb_user ON tradesmen_background_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_trb_verify ON tradesmen_background_checks(verified_status);

CREATE TRIGGER IF NOT EXISTS trg_trb_updated
AFTER UPDATE ON tradesmen_background_checks
BEGIN
  UPDATE tradesmen_background_checks SET updated_at = datetime('now') WHERE id = NEW.id;
END;

/* 5) View: quick summary for badges/filters */
CREATE VIEW IF NOT EXISTS vw_tradesmen_trust_signals AS
SELECT
  t.user_id,
  (
    SELECT MAX(expires_on) FROM tradesmen_insurance_policies i
    WHERE i.user_id = t.user_id 
      AND i.verified_status IN ('verified','manual_ok')
      AND (i.expires_on IS NULL OR i.expires_on >= date('now'))
  ) AS insurance_valid_until,
  (
    SELECT MAX(COALESCE(public_liability_pennies, coverage_amount_pennies)) FROM tradesmen_insurance_policies i
    WHERE i.user_id = t.user_id AND i.verified_status IN ('verified','manual_ok')
  ) AS max_public_liability_pennies,
  (
    SELECT COUNT(1) FROM tradesmen_memberships m
    WHERE m.user_id = t.user_id 
      AND m.verified_status IN ('verified','manual_ok')
      AND (m.expiry_date IS NULL OR m.expiry_date >= date('now'))
  ) AS verified_membership_count,
  (
    SELECT COUNT(1) FROM tradesmen_certifications c
    WHERE c.user_id = t.user_id 
      AND c.verified_status IN ('verified','manual_ok')
      AND (c.expires_on IS NULL OR c.expires_on >= date('now'))
  ) AS verified_cert_count
FROM tradesmen t;
