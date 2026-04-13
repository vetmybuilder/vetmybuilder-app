/**
 * POST /api/admin/tradesmen/:uid/subscription/approve
 *
 * Admin approves a pending subscription (from payments_subscription).
 * Marks subscription as active and updates tradesmen.plan accordingly.
 *
 * NEW:
 *   - Only allowed when tradesman.verification_status = 'approved'
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  const TAG = "admin.subscription.approve";

  router.post(
    "/admin/tradesmen/:uid/subscription/approve",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: TAG });

      try {
        const uid = req.params.uid;

        // STEP 0 — Ensure tradesman exists + is verified
        const [tradesman] = await mysqlQuery(
          `
          SELECT verification_status
            FROM tradesmen
           WHERE user_id = ?
           LIMIT 1
        `,
          [uid]
        );

        if (!tradesman) {
          log.warn({ uid }, "Tradesman not found for subscription approve");
          return res.status(404).json({
            error: "not_found",
            message: "Tradesman not found",
          });
        }

        const verificationStatus = String(
          tradesman.verification_status || ""
        ).toLowerCase();

        if (verificationStatus !== "approved") {
          log.warn(
            { uid, verificationStatus },
            "Subscription approve blocked – verification not approved"
          );
          return res.status(400).json({
            error: "verification_not_approved",
            code: "VERIFICATION_REQUIRED",
            message:
              "Cannot activate subscription until verification is approved.",
          });
        }

        // STEP 1 — Get latest pending subscription from payments_subscription
        const subRows = await mysqlQuery(
          `
          SELECT id, plan_id, status
          FROM payments_subscription
          WHERE buyer_uid = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
          [uid]
        );

        if (!subRows.length) {
          log.warn({ uid }, "No subscription rows found");
          return res.status(400).json({
            error: "no_pending_plan",
            message: "No subscription found for this user",
          });
        }

        const sub = subRows[0];

        if (String(sub.status).toLowerCase() !== "pending_admin") {
          log.warn({ uid, status: sub.status }, "Subscription not pending");
          return res.status(400).json({
            error: "no_pending_plan",
            message: "No pending subscription to approve",
          });
        }

        const planId = sub.plan_id;

        // STEP 2 — Approve subscription in payments_subscription
        await mysqlQuery(
          `
          UPDATE payments_subscription
             SET status = 'active'
           WHERE id = ?
        `,
          [sub.id]
        );

        // STEP 3 — Update tradesmen table (entitlement)
        await mysqlQuery(
          `
          UPDATE tradesmen
             SET plan = ?,
                 plan_updated_at = NOW(),
                 subscription_status = 'active'
           WHERE user_id = ?
        `,
          [planId, uid]
        );

        log.info({ uid, approvedPlan: planId }, "Subscription approved");

        res.json({
          ok: true,
          uid,
          approvedPlan: planId,
        });
        ctx.logActivity("admin.subscription.approve", "info", req.user.uid, "Subscription approved");
        return;
      } catch (e) {
        logger.error(
          {
            route: TAG,
            err: e?.message,
            stack: e?.stack,
          },
          "Subscription approve failed"
        );

        return res.status(500).json({
          error: "server_error",
          message: e?.message || "Server error",
        });
      }
    }
  );
};
