CREATE INDEX IF NOT EXISTS idx_recs_project_createdAt ON recommendations(projectId, createdAt DESC);
