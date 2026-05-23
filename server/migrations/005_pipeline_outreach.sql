-- 005_pipeline_outreach.sql
-- Adds per-row outreach state so the admin trade-pipeline can compose,
-- send (via Resend), and audit cold-outreach emails without double-sending.

ALTER TABLE tradesperson_pipeline
  ADD COLUMN outreach_sent_at DATETIME NULL AFTER claimed_by,
  ADD COLUMN outreach_subject VARCHAR(255) NULL AFTER outreach_sent_at,
  ADD COLUMN outreach_body TEXT NULL AFTER outreach_subject;
