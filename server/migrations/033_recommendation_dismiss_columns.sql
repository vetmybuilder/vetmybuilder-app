ALTER TABLE recommendations
  ADD COLUMN deck_dismissed_at DATETIME NULL,
  ADD COLUMN homeowner_unfavourited_at DATETIME NULL,
  ADD INDEX idx_recs_deck_active (projectId, deck_dismissed_at, homeowner_unfavourited_at);
