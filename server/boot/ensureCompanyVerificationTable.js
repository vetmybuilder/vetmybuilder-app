// server/v2/boot/ensureCompanyVerificationTable.js
module.exports = function ensureCompanyVerificationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendationId INTEGER NOT NULL,
      status TEXT NOT NULL,                        -- queued | running | verified | ambiguous | no_match | error
      companyNumber TEXT,
      companyName TEXT,
      score INTEGER,
      sicCodes TEXT,                               -- JSON string array
      raw TEXT,                                    -- raw JSON of best/candidates for support/debug
      errorMessage TEXT,
      checkedAt TEXT NOT NULL,                     -- ISO timestamp
      UNIQUE(recommendationId)
    );
    CREATE INDEX IF NOT EXISTS idx_cv_rec ON company_verifications(recommendationId);
  `);
};
