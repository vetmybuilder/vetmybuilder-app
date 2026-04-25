// server/routes/subscriptions/stripe-webhook.post.js
//
// POST /api/subscriptions/stripe-webhook

module.exports = function mountStripeWebhook(router, ctx) {
  const { mysqlQuery, payments } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

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
      } else if (type === "customer.subscription.deleted") {
        const subId = obj.id;
        await mysqlQuery(
          `UPDATE builder_subscriptions
              SET status = 'canceled', canceled_at = NOW()
            WHERE stripe_subscription_id = ?`,
          [subId],
        );
      }
      return res.status(200).json({ received: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Webhook processing failed" });
    }
  });
};
