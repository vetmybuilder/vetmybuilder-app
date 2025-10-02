-- Recreate recommendations with recommenderUserId nullable (no nested transactions)

-- If a previous failed attempt created the temp table, this keeps reruns safe
DROP TABLE IF EXISTS recommendations_new;

CREATE TABLE recommendations_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  projectId         INTEGER NOT NULL,
  recommenderUserId TEXT,                 -- now nullable
  createdAt         TEXT NOT NULL,

  name              TEXT,
  email             TEXT,
  company           TEXT,
  rating            INTEGER,
  comment           TEXT,
  isAnonymous       INTEGER DEFAULT 0,

  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO recommendations_new (
  id, projectId, recommenderUserId, createdAt,
  name, email, company, rating, comment, isAnonymous
)
SELECT
  id, projectId, recommenderUserId, createdAt,
  name, email, company, rating, comment,
  COALESCE(isAnonymous, 0)
FROM recommendations;

DROP TABLE recommendations;
ALTER TABLE recommendations_new RENAME TO recommendations;

CREATE INDEX IF NOT EXISTS idx_recs_project ON recommendations(projectId);
CREATE INDEX IF NOT EXISTS idx_recs_user ON recommendations(recommenderUserId);
