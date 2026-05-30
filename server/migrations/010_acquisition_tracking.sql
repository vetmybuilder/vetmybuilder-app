-- Acquisition tracking: per-campaign scan funnel + signup attribution.
--
-- `acquisition_scans` logs one row per GET /api/track/go/:code (the
-- endpoint behind the printed QR / short link). `tradesmen.acq_ref` is
-- set on signup so admin can join the two and report
-- scans -> signups -> conversion per ref code.

CREATE TABLE IF NOT EXISTS acquisition_scans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ref VARCHAR(64) NOT NULL,
  scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  INDEX idx_acquisition_scans_ref (ref, scanned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tradesmen
  ADD COLUMN acq_ref VARCHAR(64) NULL,
  ADD INDEX idx_tradesmen_acq_ref (acq_ref);
