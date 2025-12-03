/**
 * POST /api/admin/spotlight/reject
 * Rejects a pending Spotlight purchase.
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  console.log("[routes] mounted: POST /admin/spotlight/reject");

  router.post(
    "/admin/spotlight/reject",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      try {
        const { paymentId } = req.body || {};
        if (!paymentId) {
          return res.status(400).json({
            ok: false,
            error: "MISSING_PAYMENT_ID",
          });
        }

        // Fetch the target one-off payment
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
          return res.status(404).json({ ok: false, error: "NOT_FOUND" });
        }

        // Only pending_admin is rejectable
        if (payment.status !== "pending_admin") {
          return res.status(400).json({
            ok: false,
            error: "NOT_PENDING",
            message: "Spotlight purchase is not pending admin review",
          });
        }

        // Reject it
        await mysqlQuery(
          `
          UPDATE payments_oneoff
          SET status = 'rejected',
              rejected_at = NOW()
          WHERE id = ?
        `,
          [paymentId]
        );

        // Spotlight does NOT modify tradesmen.plan anymore
        // So NO update on tradesmen table here.

        return res.json({ ok: true, paymentId });
      } catch (e) {
        console.error("[admin.spotlight.reject] error", e);
        return res.status(500).json({
          ok: false,
          error: "ADMIN_SPOTLIGHT_REJECT_FAILED",
          message: e?.message || String(e),
        });
      }
    }
  );
};
