CREATE TABLE IF NOT EXISTS recommendation_invites (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  recommendationId INT NOT NULL,
  sentToEmail    VARCHAR(255) NOT NULL,
  emailSentAt    DATETIME NULL,
  nudgeCount     INT NOT NULL DEFAULT 0,
  lastNudgedAt   DATETIME NULL,
  createdAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_recommendation_invites_rec (recommendationId),
  INDEX idx_recommendation_invites_lastnudged (lastNudgedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
