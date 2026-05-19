// server/lib/payments/handlers/subscriptionCheckoutCompleted.js
//
// Handler for Stripe checkout.session.completed events in subscription mode.
// Inserts or updates the builder_subscriptions row, then syncs the cache.
// Extracted from server/routes/subscriptions/stripe-webhook.post.js.

const { syncSubscriptionCache } = require("../../subscriptions/syncSubscriptionCache");

async function subscriptionCheckoutCompleted({ event, ctx }) {
  const { mysqlQuery, log = console } = ctx;
  const obj = event?.data?.object || {};
  if (obj.mode !== "subscription") return;
  const userId = obj.metadata?.userId;
  const tier = obj.metadata?.tier;
  const subId = obj.subscription;
  if (!userId || !tier || !subId) return;

  await mysqlQuery(
    `INSERT INTO builder_subscriptions
       (user_id, tier_id, stripe_subscription_id, status)
     VALUES (?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE
       status = 'active',
       tier_id = VALUES(tier_id),
       user_id = VALUES(user_id)`,
    [userId, tier, subId],
  );
  await syncSubscriptionCache({ mysqlQuery, userId, log });
}

module.exports = { subscriptionCheckoutCompleted };
