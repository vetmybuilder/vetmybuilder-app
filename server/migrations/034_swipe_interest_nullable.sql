-- Allow builder-initiated swipes: homeowner_swiped_at may be NULL until
-- the homeowner reciprocates.
ALTER TABLE swipe_interest
  MODIFY COLUMN homeowner_swiped_at DATETIME NULL DEFAULT NULL;
