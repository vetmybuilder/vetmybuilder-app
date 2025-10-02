-- 002_add_phone_to_recommendations.sql
ALTER TABLE recommendations
  ADD COLUMN phone TEXT;  -- nullable, optional
