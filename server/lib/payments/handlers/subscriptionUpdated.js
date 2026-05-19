// server/lib/payments/handlers/subscriptionUpdated.js
//
// Handler for Stripe customer.subscription.updated events.
// Updates status and period dates in builder_subscriptions, then syncs cache.
// Extracted from server/routes/subscriptions/stripe-webhook.post.js.

const { syncSubscriptionCache } = require("../../subscriptions/syncSubscriptionCache");
const { userIdFromSubId } = require("./_shared");

async function subscriptionUpdated({ event, ctx }) {
  const { mysqlQuery, log = console } = ctx;
  const obj = event?.data?.object || {};
  const subId = obj.id;
  const status = obj.status || "active";
  const start = obj.current_period_start ? new Date(obj.current_period_start * 1000) : null;
  const end = obj.current_period_end ? new Date(obj.current_period_end * 1000) : null;
  await mysqlQuery(
    `UPDATE builder_subscriptions
        SET status = ?, current_period_start = ?, current_period_end = ?
      WHERE stripe_subscription_id = ?`,
    [status, start, end, subId],
  );
  const userId = await userIdFromSubId(mysqlQuery, subId);
  if (userId) await syncSubscriptionCache({ mysqlQuery, userId, log });
}

module.exports = { subscriptionUpdated };
