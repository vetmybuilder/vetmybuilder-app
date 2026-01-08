/* 025_subscriptions_pending_and_history.sql
   Adds:
     - tradesmen.purchased_plan TEXT  (holds the requested plan while docs are checked)
     - subscriptions_history     (append-only audit of subscription events)
*/

/* 1) Pending slot for requested upgrades (kept NULL until a purchase occurs) */
ALTER TABLE tradesmen ADD COLUMN purchased_plan TEXT;

/* 2) Append-only audit log of subscription lifecycle events */
CREATE TABLE IF NOT EXISTS subscriptions_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,                 -- matches tradesmen.user_id
  event           TEXT NOT NULL,                 -- 'signup' | 'purchase' | 'approve' | 'reject' | 'downgrade' | 'upgrade' | 'cancel'
  from_status     TEXT,                          -- previous subscription_status
  to_status       TEXT,                          -- new subscription_status
  from_plan       TEXT,                          -- previous plan (live/entitled)
  to_plan         TEXT,                          -- new plan (live/entitled)
  purchased_plan  TEXT,                          -- plan requested/paid for at this event (if applicable)
  actor           TEXT,                          -- 'system' (webhook/route) or admin user id/email
  reason          TEXT,                          -- optional free-text reason (admin notes, failure message, etc.)
  at              TEXT NOT NULL                  -- ISO8601 timestamp
);

/* Helpful index for common lookups */
CREATE INDEX IF NOT EXISTS idx_subhist_user_at ON subscriptions_history(user_id, at);