-- Example: add a column with a default for existing rows
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
