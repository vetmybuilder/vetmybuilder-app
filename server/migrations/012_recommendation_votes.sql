-- server/migrations/012_recommendation_votes.sql
-- Voting on recommendations (one vote per user per recommendation)

CREATE TABLE IF NOT EXISTS recommendation_votes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendationId INTEGER NOT NULL,
  userId          TEXT    NOT NULL,
  value           INTEGER NOT NULL CHECK (value IN (-1, 1)),
  createdAt       TEXT    NOT NULL DEFAULT (datetime('now')),
  updatedAt       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (recommendationId, userId),
  FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendation_votes_rec
  ON recommendation_votes (recommendationId);

CREATE INDEX IF NOT EXISTS idx_recommendation_votes_user
  ON recommendation_votes (userId);

-- keep updatedAt fresh on updates
CREATE TRIGGER IF NOT EXISTS trg_recommendation_votes_updated
AFTER UPDATE ON recommendation_votes
FOR EACH ROW
BEGIN
  UPDATE recommendation_votes
     SET updatedAt = datetime('now')
   WHERE id = OLD.id;
END;
