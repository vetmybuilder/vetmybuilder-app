-- Add a public-facing URL-safe ID to tradesmen so the Firebase UID is never exposed in URLs.
ALTER TABLE tradesmen ADD COLUMN public_id VARCHAR(36) NULL;
UPDATE tradesmen SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE tradesmen MODIFY COLUMN public_id VARCHAR(36) NOT NULL;
CREATE UNIQUE INDEX idx_tradesmen_public_id ON tradesmen (public_id);
