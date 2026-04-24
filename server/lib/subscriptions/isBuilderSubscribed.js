// server/lib/subscriptions/isBuilderSubscribed.js
//
// Cheap predicate consumed by the match engine (Plan 2) on every ranking
// build and on every swipe endpoint. Single indexed query against
// builder_subscriptions. Fails safe — returns false on any error.

async function isBuilderSubscribed(userId, mysqlQuery) {
  if (!userId || typeof userId !== "string") return false;
  if (typeof mysqlQuery !== "function") return false;

  try {
    const rows = await mysqlQuery(
      `SELECT status, current_period_end
         FROM builder_subscriptions
        WHERE user_id = ?
          AND status = 'active'
          AND current_period_end IS NOT NULL
          AND current_period_end > NOW()
        LIMIT 1`,
      [userId],
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    // Swallow and fail closed. The match engine calls this on every
    // ranking; a transient DB hiccup shouldn't 500 the homeowner's deck.
    return false;
  }
}

module.exports = { isBuilderSubscribed };
