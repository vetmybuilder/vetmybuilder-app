-- 003_web_verification_reason.sql
-- Adds the human-readable reason code surfaced in admin when a website
-- check could not be confirmed (e.g. parked_or_placeholder, brand_mismatch,
-- fetch_failed, external_services_mocked).

ALTER TABLE tradesmen
  ADD COLUMN web_verification_reason VARCHAR(64) NULL AFTER web_verified;
