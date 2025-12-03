/**
 * POST /api/admin/tradesmen/:uid/subscription/approve
 *
 * Admin approves a pending subscription.
 * Moves purchased_plan → plan, sets subscription_status = 'active'.
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  console.log(
    "[routes] mounted: POST /admin/tradesmen/:uid/subscription/approve"
  );

  router.post(
    "/admin/tradesmen/:uid/subscription/approve",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      try {
        const uid = req.params.uid;

        // Look up purchased_plan
        const rows = await mysqlQuery(
          `
          SELECT purchased_plan
          FROM tradesmen
          WHERE user_id = ?
          LIMIT 1
        `,
          [uid]
        );

        if (!rows.length) {
          console.warn(
            "[admin.subscription.approve] no tradesman found for uid:",
            uid
          );
          return res.status(404).json({
            error: "not_found",
            message: "Tradesman not found",
          });
        }

        const pendingPlan = rows[0].purchased_plan;
        if (!pendingPlan) {
          console.warn(
            "[admin.subscription.approve] no pending purchased_plan for uid:",
            uid
          );
          return res.status(400).json({
            error: "no_pending_plan",
            message: "No purchased_plan exists to approve",
          });
        }

        // Move purchased_plan → plan
        await mysqlQuery(
          `
          UPDATE tradesmen
             SET plan = purchased_plan,
                 purchased_plan = NULL,
                 subscription_status = 'active',
                 plan_updated_at = NOW()
           WHERE user_id = ?
        `,
          [uid]
        );

        console.log(
          `[admin.subscription.approve] Approved plan '${pendingPlan}' for uid ${uid}`
        );

        return res.json({
          ok: true,
          uid,
          approvedPlan: pendingPlan,
        });
      } catch (e) {
        console.error("[admin.subscription.approve] error:", e);
        return res.status(500).json({
          error: "server_error",
          message: e?.message || "Server error",
        });
      }
    }
  );
};
