-- 027_add_google_reviews_to_tradesmen.sql

-- Store the linked Google Place, rating and review count
ALTER TABLE tradesmen
  ADD COLUMN google_place_id TEXT;

ALTER TABLE tradesmen
  ADD COLUMN google_rating REAL;

ALTER TABLE tradesmen
  ADD COLUMN google_reviews_count INTEGER;
