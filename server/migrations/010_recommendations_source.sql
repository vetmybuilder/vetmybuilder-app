-- Adds a source column to recommendations to identify how it was created
-- 'magic' (via invite link) | 'platform' (via logged-in UI)

ALTER TABLE recommendations
ADD COLUMN source TEXT DEFAULT 'magic';
