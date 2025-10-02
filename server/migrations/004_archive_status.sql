-- Add archivedAt (nullable) and convert any old 'closed' statuses to 'archived'
ALTER TABLE projects ADD COLUMN archivedAt TEXT;

UPDATE projects SET status = 'archived' WHERE status = 'closed' OR LOWER(status) = 'closed';
-- Leave archivedAt null for historical rows; it will be set on future archives
