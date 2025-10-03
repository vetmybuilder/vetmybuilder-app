-- 013_recommendation_photos.sql
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS recommendation_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendationId INTEGER NOT NULL,
  filePath TEXT NOT NULL,       -- relative path under /uploads
  mime TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rec_photos_rec ON recommendation_photos(recommendationId);
