-- NOTE: Do not wrap in BEGIN/COMMIT; your runner handles transactions.

-- Add columns if they don't exist (each will no-op if already present)
ALTER TABLE users ADD COLUMN locationRaw TEXT;
ALTER TABLE users ADD COLUMN postcode TEXT;
ALTER TABLE users ADD COLUMN postcodeSector TEXT;
ALTER TABLE users ADD COLUMN postcodeOutward TEXT;
ALTER TABLE users ADD COLUMN city TEXT;

-- Backfill from user_profiles if it exists, using correlated subqueries
-- Each column is fully qualified to avoid "ambiguous column name".
UPDATE users
SET
  locationRaw = COALESCE(
    users.locationRaw,
    (SELECT up.locationRaw FROM user_profiles AS up WHERE up.userId = users.uid LIMIT 1)
  ),
  postcode = COALESCE(
    users.postcode,
    (SELECT up.postcode FROM user_profiles AS up WHERE up.userId = users.uid LIMIT 1)
  ),
  postcodeSector = COALESCE(
    users.postcodeSector,
    (SELECT up.postcodeSector FROM user_profiles AS up WHERE up.userId = users.uid LIMIT 1)
  ),
  postcodeOutward = COALESCE(
    users.postcodeOutward,
    (SELECT up.postcodeOutward FROM user_profiles AS up WHERE up.userId = users.uid LIMIT 1)
  ),
  city = COALESCE(
    users.city,
    (SELECT up.city FROM user_profiles AS up WHERE up.userId = users.uid LIMIT 1)
  )
WHERE EXISTS (
  SELECT 1 FROM sqlite_master
  WHERE type = 'table' AND name = 'user_profiles'
);
