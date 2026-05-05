// server/lib/subscriptions/syncSubscriptionCache.js
//
// `tradesmen.subscription_status` is a denormalised cache of the live
// subscription state held in `builder_subscriptions`. Anywhere we mutate
// builder_subscriptions (mock activate, mock cancel, Stripe webhook) we
// must call this helper so the two columns don't drift.
//
// Truth: the cache is "active" iff a row exists for the user with
// status='active' AND current_period_end in the future. Anything else
// (no row, canceled, expired) maps to "free".
//
// Called by:
//   - server/lib/payments/mock.js  (createSubscriptionCheckout, cancelSubscriptionAtPeriodEnd)
//   - server/routes/subscriptions/stripe-webhook.post.js  (all three event branches)

async function syncSubscriptionCache({ mysqlQuery, userId, log }) {
  if (!mysqlQuery || !userId) return null;
  try {
    const rows = await mysqlQuery(
      `SELECT 1
         FROM builder_subscriptions
        WHERE user_id = ?
          AND status = 'active'
          AND current_period_end > NOW()
        LIMIT 1`,
      [userId],
    );
    const newStatus = rows.length > 0 ? "active" : "free";
    await mysqlQuery(
      `UPDATE tradesmen SET subscription_status = ? WHERE user_id = ?`,
      [newStatus, userId],
    );
    return newStatus;
  } catch (e) {
    (log || console).warn?.(
      `[syncSubscriptionCache] failed for ${userId}: ${e?.message || e}`,
    );
    return null;
  }
}

module.exports = { syncSubscriptionCache };
