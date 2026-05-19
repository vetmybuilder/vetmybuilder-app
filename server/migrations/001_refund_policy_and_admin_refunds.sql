-- 001_refund_policy_and_admin_refunds.sql
-- Records CCR 2013 immediate-supply waiver acceptance against paid
-- orders, and adds an audit table for refunds issued via the admin tool.

ALTER TABLE project_contact_unlocks
  ADD COLUMN waiver_accepted_at DATETIME NULL,
  ADD COLUMN waiver_policy_version VARCHAR(32) NULL;

ALTER TABLE payments_subscription
  ADD COLUMN waiver_accepted_at DATETIME NULL,
  ADD COLUMN waiver_policy_version VARCHAR(32) NULL;

ALTER TABLE builder_subscriptions
  ADD COLUMN waiver_accepted_at DATETIME NULL,
  ADD COLUMN waiver_policy_version VARCHAR(32) NULL;

CREATE TABLE admin_refunds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stripe_refund_id VARCHAR(64) NULL,
  payment_intent_id VARCHAR(64) NULL,
  charge_id VARCHAR(64) NULL,
  amount_pence INT NULL,
  reason TEXT NOT NULL,
  admin_uid VARCHAR(64) NOT NULL,
  status ENUM('success','error') NOT NULL,
  error_text TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment_intent (payment_intent_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
