
-- 018_project_closure_photos.sql
-- Photos associated with a project's closure (work completed gallery)
CREATE TABLE IF NOT EXISTS project_closure_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId INTEGER NOT NULL,
  filePath TEXT NOT NULL,
  mime TEXT,
  sizeBytes INTEGER,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_closure_photos_project ON project_closure_photos(projectId);
