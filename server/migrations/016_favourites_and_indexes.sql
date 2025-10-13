-- server/migrations/016_favourites_and_indexes.sql
-- Creates the favourites join table and helpful indexes for /api/projects.
-- No changes to the users table (Community tab no longer depends on users.location).

-- 1) Join table for favourites (starred projects)
CREATE TABLE IF NOT EXISTS favourites (
  userId    TEXT    NOT NULL,
  projectId INTEGER NOT NULL,
  createdAt TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (userId, projectId),
  FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favourites_user      ON favourites(userId);
CREATE INDEX IF NOT EXISTS idx_favourites_project   ON favourites(projectId);
CREATE INDEX IF NOT EXISTS idx_favourites_createdAt ON favourites(createdAt);

-- 2) Project-side indexes to keep tab queries snappy
CREATE INDEX IF NOT EXISTS idx_projects_owner_status     ON projects(ownerUserId, status);
CREATE INDEX IF NOT EXISTS idx_projects_status_location  ON projects(status, location);
CREATE INDEX IF NOT EXISTS idx_projects_createdAt        ON projects(createdAt);
CREATE INDEX IF NOT EXISTS idx_projects_name             ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_type             ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_propertyType     ON projects(propertyType);
