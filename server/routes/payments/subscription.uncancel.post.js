// server/routes/payments/subscription.uncancel.post.js
//
// Reverses a previously requested cancel-at-period-end (mock provider).
// Result: subscription goes back to 'active' and user continues on Gold.

module.exports = (router, ctx) => {
  const log = ctx.log || console;

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

  const isBetter = !!ctx.db?.prepare;
  const run = async (sql, params = []) => {
    if (!ctx.db) throw new Error("db unavailable");
    if (isBetter) return ctx.db.prepare(sql).run(params);
    if (typeof ctx.db.run === "function") return ctx.db.run(sql, params);
    throw new Error("unknown db driver");
  };
  const get = async (sql, params = []) => {
    if (!ctx.db) throw new Error("db unavailable");
    if (isBetter) return ctx.db.prepare(sql).get(params);
    if (typeof ctx.db.get === "function") return ctx.db.get(sql, params);
    throw new Error("unknown db driver");
  };

  router.post("/payments/subscription/uncancel", ctx.auth, async (req, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "unauthorized" });
      }

      // Find the latest Gold sub that is pending cancellation
      const sub = await get(
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

      if (!sub) {
        return res.status(404).json({
          error: "no_pending_cancellation",
          hint: "No Gold subscription pending cancellation to undo",
        });
      }

      // Flip it back to active
      await run(
        `
        UPDATE payments_subscription
        SET status = 'active'
        WHERE id = ?
        `,
        [sub.id]
      );

      // Clear pending flags/timestamps on tradesmen row
      await run(
        `
        UPDATE tradesmen
        SET subscription_status = 'active',
            plan_update_at      = NULL,
            plan_updated_at     = NULL
        WHERE user_id = ?
        `,
        [userId]
      );

      log.info?.("[payments][uncancel] restored to active", {
        userId,
        subscription_id: sub.id,
      });

      return res.json({
        ok: true,
        status: "active",
        plan: "gold",
      });
    } catch (e) {
      log.info?.("[payments][uncancel] error", e?.message || e);
      return res
        .status(500)
        .json({ error: "internal_error", details: e?.message || String(e) });
    }
  });
};
