-- server/migrations/008_user_profiles.sql
-- Stores each user's location (postcode/city) for geoscoped notifications

CREATE TABLE IF NOT EXISTS user_profiles (
  userId TEXT PRIMARY KEY,
  locationRaw TEXT,
  postcode TEXT,          -- full postcode e.g. "E4 6JH"
  postcodeSector TEXT,    -- outward + first inward digit e.g. "E4 6"
  postcodeOutward TEXT,   -- outward e.g. "E4"
  city TEXT,              -- freeform city/borough token e.g. "chingford"
  updatedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_postcode ON user_profiles(postcode);
CREATE INDEX IF NOT EXISTS idx_user_profiles_sector ON user_profiles(postcodeSector);
CREATE INDEX IF NOT EXISTS idx_user_profiles_outward ON user_profiles(postcodeOutward);
CREATE INDEX IF NOT EXISTS idx_user_profiles_city ON user_profiles(city);
