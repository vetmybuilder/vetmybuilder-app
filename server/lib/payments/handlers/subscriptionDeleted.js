// server/lib/payments/handlers/subscriptionDeleted.js
//
// Handler for Stripe customer.subscription.deleted events.
// Marks the builder_subscriptions row as canceled and syncs the cache.
// Extracted from server/routes/subscriptions/stripe-webhook.post.js.

const { syncSubscriptionCache } = require("../../subscriptions/syncSubscriptionCache");
const { userIdFromSubId } = require("./_shared");

async function subscriptionDeleted({ event, ctx }) {
  const { mysqlQuery, log = console } = ctx;
  const obj = event?.data?.object || {};
  const subId = obj.id;
  // Look up the user before mutating so we still have it after the status flip.
  const userId = await userIdFromSubId(mysqlQuery, subId);
  await mysqlQuery(
    `UPDATE builder_subscriptions
        SET status = 'canceled', canceled_at = NOW()
      WHERE stripe_subscription_id = ?`,
    [subId],
  );
  if (userId) await syncSubscriptionCache({ mysqlQuery, userId, log });
}

module.exports = { subscriptionDeleted };
