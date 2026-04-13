/**
 * POST /api/admin/spotlight/reject
 * Rejects a pending Spotlight purchase.
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const TAG = "admin.spotlight.reject";

  router.post(
    "/admin/spotlight/reject",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: TAG });

      try {
        const { paymentId } = req.body || {};

        if (!paymentId) {
          log.warn("Missing paymentId");
          return res.status(400).json({
            ok: false,
            error: "MISSING_PAYMENT_ID",
          });
        }

        // Fetch the payment
        const rows = await mysqlQuery(
          `
          SELECT id, user_id, status
          FROM payments_oneoff
          WHERE id = ?
            AND type = 'spotlight'
          LIMIT 1
        `,
          [paymentId]
        );

        const payment = rows[0];

        if (!payment) {
          log.warn({ paymentId }, "Spotlight payment not found");
          return res.status(404).json({ ok: false, error: "NOT_FOUND" });
        }

        if (payment.status !== "pending_admin") {
          log.warn(
            { paymentId, status: payment.status },
            "Spotlight payment is not pending_admin"
          );
          return res.status(400).json({
            ok: false,
            error: "NOT_PENDING",
            message: "Spotlight purchase is not pending admin review",
          });
        }

        // Reject payment
        await mysqlQuery(
          `
          UPDATE payments_oneoff
          SET status = 'rejected',
              rejected_at = NOW()
          WHERE id = ?
        `,
          [paymentId]
        );

        log.info({ paymentId }, "Spotlight payment rejected");

        res.json({ ok: true, paymentId });
        ctx.logActivity("admin.spotlight.reject", "info", req.user.uid, "Spotlight rejected");
        return;
      } catch (e) {
        logger.error(
          {
            route: TAG,
            err: e?.message,
            stack: e?.stack,
          },
          "Spotlight rejection failed"
        );

        return res.status(500).json({
          ok: false,
          error: "ADMIN_SPOTLIGHT_REJECT_FAILED",
          message: e?.message || String(e),
        });
      }
    }
  );
};
