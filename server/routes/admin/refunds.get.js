// server/routes/admin/refunds.get.js
//
// GET /api/admin/refunds - last 50 admin-issued refunds, newest first.
// Backs the audit table on the /admin/refunds page.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get(
    "/admin/refunds",
    auth,
    requireAdmin(ctx),
    async (_req, res) => {
      const rows = await mysqlQuery(
        `SELECT id, stripe_refund_id, payment_intent_id, charge_id,
                amount_pence, reason, admin_uid, status, error_text, created_at
           FROM admin_refunds
          ORDER BY id DESC
          LIMIT 50`,
      );
      return res.json({ items: rows });
    },
  );
};
