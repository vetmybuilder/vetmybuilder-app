// server/routes/subscriptions/stripe-webhook.post.js
//
// POST /api/subscriptions/stripe-webhook

const { syncSubscriptionCache } = require("../../lib/subscriptions/syncSubscriptionCache");

module.exports = function mountStripeWebhook(router, ctx) {
  const { mysqlQuery, payments } = ctx;
  const log = ctx.log || console;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // Look up the user_id behind a stripe_subscription_id - needed for the
  // updated/deleted webhook events which only carry the subscription id.
  async function userIdFromSubId(subId) {
    if (!subId) return null;
    try {
      const rows = await mysqlQuery(
        `SELECT user_id FROM builder_subscriptions
          WHERE stripe_subscription_id = ?
          LIMIT 1`,
        [subId],
      );
      return rows?.[0]?.user_id || null;
    } catch {
      return null;
    }
  }

  router.post("/subscriptions/stripe-webhook", async (req, res) => {
    let event;
    try {
      if (!payments?.verifyWebhook) throw new Error("payments.verifyWebhook missing");
      event = payments.verifyWebhook(req);
    } catch (e) {
      return res.status(400).json({ error: e?.message || "Invalid webhook" });
    }

    const type = event?.type;
    const obj = event?.data?.object || {};

    try {
      if (type === "checkout.session.completed" && obj.mode === "subscription") {
        const userId = obj.metadata?.userId;
        const tier = obj.metadata?.tier;
        const subId = obj.subscription;
        if (userId && tier && subId) {
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
      } else if (type === "customer.subscription.updated") {
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
        const userId = await userIdFromSubId(subId);
        if (userId) await syncSubscriptionCache({ mysqlQuery, userId, log });
      } else if (type === "customer.subscription.deleted") {
        const subId = obj.id;
        // Look up the user before mutating so we still have it after the
        // status flip.
        const userId = await userIdFromSubId(subId);
        await mysqlQuery(
          `UPDATE builder_subscriptions
              SET status = 'canceled', canceled_at = NOW()
            WHERE stripe_subscription_id = ?`,
          [subId],
        );
        if (userId) await syncSubscriptionCache({ mysqlQuery, userId, log });
      }
      return res.status(200).json({ received: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Webhook processing failed" });
    }
  });
};
