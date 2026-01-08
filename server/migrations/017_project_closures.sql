-- 017_project_closures.sql
-- Adds a table to record why a project was closed and whether work went ahead.

CREATE TABLE IF NOT EXISTS project_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId INTEGER NOT NULL UNIQUE,
  didGoAhead INTEGER NOT NULL DEFAULT 1, -- 1=true, 0=false
  reasons TEXT,               -- JSON array of strings
  otherReason TEXT,
  createdBy TEXT,             -- uid
  createdAt TEXT NOT NULL,
  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_closures_projectId ON project_closures(projectId);
