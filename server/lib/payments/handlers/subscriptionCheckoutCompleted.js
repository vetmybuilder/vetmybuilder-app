// server/lib/payments/handlers/subscriptionCheckoutCompleted.js
//
// Handler for Stripe checkout.session.completed events in subscription mode.
// Inserts or updates the builder_subscriptions row, then syncs the cache.
// Extracted from server/routes/subscriptions/stripe-webhook.post.js.

const { syncSubscriptionCache } = require("../../subscriptions/syncSubscriptionCache");
const { REFUND_POLICY_VERSION } = require("../refundPolicyVersion");

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
       (user_id, tier_id, stripe_subscription_id, status,
        waiver_accepted_at, waiver_policy_version)
     VALUES (?, ?, ?, 'active', NOW(), ?)
     ON DUPLICATE KEY UPDATE
       status = 'active',
       tier_id = VALUES(tier_id),
       user_id = VALUES(user_id),
       waiver_accepted_at = COALESCE(waiver_accepted_at, NOW()),
       waiver_policy_version = COALESCE(waiver_policy_version, VALUES(waiver_policy_version))`,
    [userId, tier, subId, REFUND_POLICY_VERSION],
  );
  await syncSubscriptionCache({ mysqlQuery, userId, log });
}

module.exports = { subscriptionCheckoutCompleted };
