// server/routes/subscriptions/cancel.post.js
//
// POST /api/subscriptions/cancel
// Cancels the caller's active subscription. Under Stripe, defers the cancel
// to the current period's end. Under the mock provider, marks canceled now.

module.exports = function mountSubscriptionCancel(router, ctx) {
  const { auth, mysqlQuery, payments } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post("/api/subscriptions/cancel", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const rows = await mysqlQuery(
      `SELECT id, stripe_subscription_id
         FROM builder_subscriptions
        WHERE user_id = ?
          AND status = 'active'
        ORDER BY current_period_end DESC
        LIMIT 1`,
      [uid],
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: "No active subscription" });

    if (payments?.isStripe && payments.cancelSubscriptionAtPeriodEnd) {
      try {
        await payments.cancelSubscriptionAtPeriodEnd(row.stripe_subscription_id);
      } catch (e) {
        return res
          .status(500)
          .json({ error: e?.message || "Stripe cancel failed" });
      }
    }

    await mysqlQuery(
      `UPDATE builder_subscriptions
          SET status = 'canceled',
              canceled_at = NOW()
        WHERE id = ?`,
      [row.id],
    );

    return res.status(200).json({ ok: true, canceled: true });
  });
};
