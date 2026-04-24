// server/lib/matching/expireSwipeInterests.js
//
// Transitions pending swipe_interest rows that haven't been responded to
// within EXPIRY_DAYS to status=expired. Invoked opportunistically on the
// builder's deck read so we don't need a cron — the set is always small
// because it's scoped to one builder's queue.

const EXPIRY_DAYS = 14;

async function expireSwipeInterests(mysqlQuery) {
  if (typeof mysqlQuery !== "function") return 0;
  try {
    const result = await mysqlQuery(
      `UPDATE swipe_interest
          SET status = 'expired'
        WHERE status = 'pending'
          AND homeowner_swiped_at < (NOW() - INTERVAL ? DAY)`,
      [EXPIRY_DAYS],
    );
    return result?.affectedRows || 0;
  } catch {
    return 0;
  }
}

module.exports = { expireSwipeInterests, EXPIRY_DAYS };
