// server/routes/admin/builder-subscriptions.post.js
//
// Admin tools for the new tier-based subscription model
// (builder_subscriptions table, week_1 / week_2 / month_1 tiers).
//
// Endpoints:
//   POST /api/admin/builder-subscriptions/grant
//        body: { userId, tier }
//        Creates / refreshes an active subscription for the tradesman.
//        tier ∈ {week_1, week_2, month_1}; period_end is set from the
//        tier's interval. Idempotent: re-running with the same userId
//        wipes any existing row first so the tier and expiry are
//        overwritten cleanly.
//
//   POST /api/admin/builder-subscriptions/revoke
//        body: { userId }
//        Cancels the active subscription (sets status='canceled' and
//        canceled_at=NOW()). After this the swipe gate kicks in again.
//
// Both call syncSubscriptionCache so tradesmen.subscription_status
// stays in step with builder_subscriptions.
//
// Replaces the old /api/admin/subscriptions endpoint for the
// week/month tier system; the legacy endpoint still exists for the
// gold/spotlight/unlock_contact plans tied to payments_oneoff.

const {
  syncSubscriptionCache,
} = require("../../lib/subscriptions/syncSubscriptionCache");

const VALID_TIERS = new Set(["week_1", "week_2", "month_1"]);

// How many days each tier covers. Mirrors server/lib/subscriptions/tiers.js
// but kept inline so this file is self-contained for grants.
const TIER_DAYS = {
  week_1: 7,
  week_2: 14,
  month_1: 30,
};

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const { requireAdmin } = require("../../lib/roles");
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post(
    "/admin/builder-subscriptions/grant",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const userId = String(req.body?.userId || "").trim();
      const tier = String(req.body?.tier || "").trim();
      if (!userId) return res.status(400).json({ error: "userId required" });
      if (!VALID_TIERS.has(tier)) {
        return res.status(400).json({
          error: "invalid_tier",
          allowed: Array.from(VALID_TIERS),
        });
      }

      const days = TIER_DAYS[tier];
      const sessionId = `admin_grant_${Date.now()}_${Math.random()
        .toString(16)
        .slice(2, 8)}`;

      try {
        await mysqlQuery(
          `DELETE FROM builder_subscriptions WHERE user_id = ?`,
          [userId],
        );
        await mysqlQuery(
          `INSERT INTO builder_subscriptions
             (user_id, tier_id, stripe_subscription_id, status,
              current_period_start, current_period_end)
           VALUES (?, ?, ?, 'active', NOW(),
                   DATE_ADD(NOW(), INTERVAL ? DAY))`,
          [userId, tier, sessionId, days],
        );
        await syncSubscriptionCache({ mysqlQuery, userId, log });

        ctx.logActivity?.(
          "admin.subscription.grant",
          "info",
          req.user?.uid,
          `Granted ${tier} to ${userId}`,
        );

        return res.json({
          ok: true,
          userId,
          tier,
          stripeSubscriptionId: sessionId,
          days,
        });
      } catch (e) {
        log.error?.(`[admin/builder-subscriptions/grant] ${e?.message || e}`);
        return res.status(500).json({ error: "grant_failed" });
      }
    },
  );

  router.post(
    "/admin/builder-subscriptions/revoke",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const userId = String(req.body?.userId || "").trim();
      if (!userId) return res.status(400).json({ error: "userId required" });

      try {
        await mysqlQuery(
          `UPDATE builder_subscriptions
              SET status = 'canceled', canceled_at = NOW()
            WHERE user_id = ? AND status = 'active'`,
          [userId],
        );
        await syncSubscriptionCache({ mysqlQuery, userId, log });

        ctx.logActivity?.(
          "admin.subscription.revoke",
          "info",
          req.user?.uid,
          `Revoked subscription for ${userId}`,
        );

        return res.json({ ok: true, userId });
      } catch (e) {
        log.error?.(`[admin/builder-subscriptions/revoke] ${e?.message || e}`);
        return res.status(500).json({ error: "revoke_failed" });
      }
    },
  );
};
