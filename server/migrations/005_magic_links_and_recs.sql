-- Magic invite tokens per project
CREATE TABLE IF NOT EXISTS recommendation_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  expiresAt TEXT, -- NULL = no expiry for now
  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
);

-- Extend recommendations to store anonymous submissions
-- Add columns if they don't already exist (SQLite ignores duplicate adds via our runner code)
ALTER TABLE recommendations ADD COLUMN name TEXT;
ALTER TABLE recommendations ADD COLUMN email TEXT;
ALTER TABLE recommendations ADD COLUMN company TEXT;
ALTER TABLE recommendations ADD COLUMN rating INTEGER; -- 1..5
ALTER TABLE recommendations ADD COLUMN comment TEXT;
ALTER TABLE recommendations ADD COLUMN isAnonymous INTEGER; -- 0/1
