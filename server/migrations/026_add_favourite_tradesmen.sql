-- server/migrations/020_add_favourite_tradesmen.sql

CREATE TABLE IF NOT EXISTS favourite_tradesmen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  builderId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE (userId, builderId)
);
