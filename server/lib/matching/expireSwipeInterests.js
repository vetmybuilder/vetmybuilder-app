// server/lib/matching/expireSwipeInterests.js
//
// Transitions pending swipe_interest rows that haven't been responded to
// within EXPIRY_DAYS to status=expired. Invoked opportunistically on the
// builder's deck read so we don't need a cron — the set is always small
// because it's scoped to one builder's queue.

const EXPIRY_DAYS = 14;

async function expireSwipeInterests(mysqlQuery) {
  if (typeof mysqlQuery !== "function") return 0;
  let total = 0;
  try {
    // Standard expiry: homeowner-initiated pending rows the builder didn't
    // respond to within EXPIRY_DAYS.
    const stale = await mysqlQuery(
      `UPDATE swipe_interest
          SET status = 'expired'
        WHERE status = 'pending'
          AND homeowner_swiped_at < (NOW() - INTERVAL ? DAY)`,
      [EXPIRY_DAYS],
    );
    total += stale?.affectedRows || 0;
  } catch {
    /* swallow */
  }
  try {
    // Paid-unlock boost expiry: the trade paid for a slot with a hard
    // ceiling. When boost_expires_at passes, the row flips to 'expired'
    // and disappears from the homeowner's deck. No refund.
    const expired = await mysqlQuery(
      `UPDATE swipe_interest
          SET status = 'expired'
        WHERE status = 'pending'
          AND source = 'paid_unlock'
          AND boost_expires_at IS NOT NULL
          AND boost_expires_at < NOW()`,
    );
    total += expired?.affectedRows || 0;
  } catch {
    /* swallow */
  }
  return total;
}

module.exports = { expireSwipeInterests, EXPIRY_DAYS };
