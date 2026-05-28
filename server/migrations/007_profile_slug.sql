ALTER TABLE tradesmen
  ADD COLUMN slug VARCHAR(255) NULL,
  ADD COLUMN profile_template VARCHAR(50) NULL,
  ADD UNIQUE KEY uq_tradesmen_slug (slug);

CREATE TABLE IF NOT EXISTS profile_enquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tradesperson_uid VARCHAR(255) NOT NULL,
  visitor_name VARCHAR(120) NOT NULL,
  visitor_phone VARCHAR(40) NOT NULL,
  visitor_email VARCHAR(190) NULL,
  message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  KEY idx_profile_enquiries_uid (tradesperson_uid),
  KEY idx_profile_enquiries_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
