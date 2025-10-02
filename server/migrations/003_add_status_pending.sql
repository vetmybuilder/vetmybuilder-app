-- Add a status column with default 'pending' for existing & new rows
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
