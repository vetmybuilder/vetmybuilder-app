/**
 * POST /api/admin/tradesmen/:uid/subscription/reject
 *
 * Admin rejects a pending subscription.
 * Sets purchased_plan = NULL (no changes to plan).
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  console.log(
    "[routes] mounted: POST /admin/tradesmen/:uid/subscription/reject"
  );

  router.post(
    "/admin/tradesmen/:uid/subscription/reject",
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
          return res.status(404).json({
            error: "not_found",
            message: "Tradesman not found",
          });
        }

        const pendingPlan = rows[0].purchased_plan;
        if (!pendingPlan) {
          return res.status(400).json({
            error: "no_pending_plan",
            message: "No purchased_plan exists to reject",
          });
        }

        // Remove purchased_plan
        await mysqlQuery(
          `
          UPDATE tradesmen
             SET purchased_plan = NULL,
                 plan_updated_at = NOW()
           WHERE user_id = ?
        `,
          [uid]
        );

        return res.json({
          ok: true,
          uid,
          rejectedPlan: pendingPlan,
        });
      } catch (e) {
        console.error("[admin.subscription.reject] error:", e);
        return res.status(500).json({
          error: "server_error",
          message: e?.message || "Server error",
        });
      }
    }
  );
};
