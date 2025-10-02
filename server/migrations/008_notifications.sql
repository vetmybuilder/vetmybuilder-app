CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT,                       -- target user
  type TEXT NOT NULL,                -- e.g. 'project_live'
  message TEXT NOT NULL,
  projectId INTEGER,
  linkPath TEXT,
  createdAt TEXT NOT NULL,
  readAt TEXT,
  FOREIGN KEY(projectId) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(userId, createdAt DESC);
