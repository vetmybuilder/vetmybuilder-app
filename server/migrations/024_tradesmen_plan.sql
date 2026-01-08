/* 024_tradesmen_plan.sql
   Add plan workflow fields without rebuilding the table (keeps dependent views ok).

   - Adds:
       plan TEXT
       plan_update_at TEXT
   - Backfills existing rows:
       subscription_status -> 'inactive' (if NULL/empty)
       plan -> 'free'       (if NULL/empty)
       plan_update_at      -> stays NULL
   - Adds AFTER INSERT trigger to enforce defaults for new rows since we
     can’t change column defaults without rebuild.
*/

/* 1) Add columns (no IF NOT EXISTS in older SQLite; this migration runs once) */
ALTER TABLE tradesmen ADD COLUMN plan TEXT;
ALTER TABLE tradesmen ADD COLUMN plan_update_at TEXT;

/* 2) Backfill existing data */
UPDATE tradesmen
   SET subscription_status = COALESCE(NULLIF(subscription_status, ''), 'inactive')
 WHERE subscription_status IS NULL OR subscription_status = '';

UPDATE tradesmen
   SET plan = 'free'
 WHERE plan IS NULL OR plan = '';

/* 3) Ensure lookups by user are fast (safe if it already exists) */
CREATE INDEX IF NOT EXISTS idx_tradesmen_user_id ON tradesmen(user_id);

/* 4) Defaults for future inserts via trigger (can’t set column defaults retroactively) */
DROP TRIGGER IF EXISTS trg_tradesmen_defaults;

CREATE TRIGGER trg_tradesmen_defaults
AFTER INSERT ON tradesmen
FOR EACH ROW
WHEN NEW.subscription_status IS NULL OR NEW.subscription_status = ''
   OR NEW.plan IS NULL OR NEW.plan = ''
BEGIN
  UPDATE tradesmen
     SET subscription_status = COALESCE(NULLIF(NEW.subscription_status,''), 'inactive'),
         plan                = COALESCE(NULLIF(NEW.plan,''), 'free')
   WHERE user_id = NEW.user_id;
END;