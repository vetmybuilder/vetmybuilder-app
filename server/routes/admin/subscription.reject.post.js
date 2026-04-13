/**
 * POST /api/admin/tradesmen/:uid/subscription/reject
 *
 * Admin rejects a pending subscription.
 * Sets purchased_plan = NULL (no changes to plan).
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  const TAG = "admin.subscription.reject";

  router.post(
    "/admin/tradesmen/:uid/subscription/reject",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: TAG });

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
          log.warn({ uid }, "Tradesman not found");
          return res.status(404).json({
            error: "not_found",
            message: "Tradesman not found",
          });
        }

        const pendingPlan = rows[0].purchased_plan;
        if (!pendingPlan) {
          log.warn({ uid }, "No purchased_plan to reject");
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

        log.info({ uid, rejectedPlan: pendingPlan }, "Subscription rejected");

        res.json({
          ok: true,
          uid,
          rejectedPlan: pendingPlan,
        });
        ctx.logActivity("admin.subscription.reject", "info", req.user.uid, "Subscription rejected");
        return;
      } catch (e) {
        logger.error(
          {
            route: TAG,
            err: e?.message,
            stack: e?.stack,
          },
          "Subscription reject failed"
        );

        return res.status(500).json({
          error: "server_error",
          message: e?.message || "Server error",
        });
      }
    }
  );
};
