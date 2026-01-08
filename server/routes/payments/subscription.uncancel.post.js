// server/routes/payments/subscription.uncancel.post.js
//
// Reverses a previously requested cancel-at-period-end (mock provider).
// Result: subscription goes back to 'active' and user continues on Gold.

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const { logger, withRequest } = require("../../lib/logger");

  function resolveUserId(req) {
    return (
      req.user?.uid ||
      req.user?.id ||
      req.auth?.uid ||
      req.account?.user_id ||
      req.session?.user?.id ||
      req.headers["x-user-id"] ||
      null
    );
  }

  router.post("/payments/subscription/uncancel", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "/payments/subscription/uncancel",
    });

    try {
      const userId = resolveUserId(req);

      if (!userId) {
        log.warn("Unauthenticated uncancel subscription attempt");
        return res.status(401).json({ error: "unauthorized" });
      }

      log.info({ userId }, "Subscription uncancel request received");

      // -------------------------------------------------------------
      // 1) Fetch the latest GOLD subscription in canceled_pending
      // -------------------------------------------------------------
      const subRows = await mysqlQuery(
        `
        SELECT *
        FROM payments_subscription
        WHERE buyer_uid = ?
          AND plan_id = 'gold'
          AND status = 'canceled_pending'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [userId]
      );

      const sub = subRows[0];

      if (!sub) {
        log.warn({ userId }, "No Gold subscription pending cancellation found");
        return res.status(404).json({
          error: "no_pending_cancellation",
          hint: "No Gold subscription pending cancellation to undo",
        });
      }

      log.info(
        { userId, subscription_id: sub.id },
        "Found pending Gold subscription; restoring to active"
      );

      // -------------------------------------------------------------
      // 2) Flip subscription back to active
      // -------------------------------------------------------------
      await mysqlQuery(
        `
        UPDATE payments_subscription
        SET status = 'active'
        WHERE id = ?
        `,
        [sub.id]
      );

      // -------------------------------------------------------------
      // 3) Reset tradesman row
      // -------------------------------------------------------------
      await mysqlQuery(
        `
        UPDATE tradesmen
        SET subscription_status = 'active',
            plan_update_at      = NULL,
            plan_updated_at     = NULL
        WHERE user_id = ?
        `,
        [userId]
      );

      log.info(
        { userId, subscription_id: sub.id },
        "Subscription successfully restored to active"
      );

      return res.json({
        ok: true,
        status: "active",
        plan: "gold",
      });
    } catch (e) {
      log.error(
        { error: e?.message, stack: e?.stack },
        "Error while uncancelling subscription"
      );

      return res.status(500).json({
        error: "internal_error",
        details: e?.message || String(e),
      });
    }
  });
};
