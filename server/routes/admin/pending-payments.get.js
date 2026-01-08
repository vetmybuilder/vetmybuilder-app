/**
 * GET /api/admin/pending-payments
 *
 * Lists pending_admin rows from payments_oneoff.
 * Admin-only.
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  // Mount log (only when DEBUG_SERVER=1)
  logger.debug("[routes] mounted: GET /admin/pending-payments");

  router.get(
    "/admin/pending-payments",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req);

      try {
        const rows = await mysqlQuery(
          `
          SELECT
            p.id,
            p.user_id,
            p.type,
            p.amount,
            p.currency,
            p.provider_session_id,
            p.created_at,
            t.company_name AS company,
            t.email AS email,
            t.phone AS phone,
            t.plan AS plan
          FROM payments_oneoff p
          LEFT JOIN tradesmen t ON t.user_id = p.user_id
          WHERE p.status = 'pending_admin'
          ORDER BY p.created_at DESC
          `
        );

        const items = rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          type: r.type,
          amount: r.amount,
          currency: r.currency,
          provider_session_id: r.provider_session_id,
          created_at: r.created_at,
          tradesman: {
            company: r.company,
            email: r.email,
            phone: r.phone,
            plan: r.plan,
          },
        }));

        log.debug({ count: items.length }, "Fetched pending admin payments");

        return res.json({ items });
      } catch (err) {
        logger.error(
          {
            err: err?.message,
            route: "/admin/pending-payments",
          },
          "Failed to load pending admin payments"
        );

        return res.status(500).json({ error: "server_error" });
      }
    }
  );
};
