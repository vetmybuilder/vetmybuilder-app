-- Create a durable users table that mirrors Firebase auth users.
-- Only stores what is needed for counting & light reporting.

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_createdAt ON users(createdAt);
