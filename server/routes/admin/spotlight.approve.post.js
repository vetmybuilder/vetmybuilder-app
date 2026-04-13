/**
 * POST /api/admin/spotlight/approve
 *
 * Admin approval for a Spotlight one-off purchase.
 *
 * NEW PIPELINE:
 *   1. Buyer completes mock checkout → pending_admin
 *   2. Admin approves via this route → pending_payment
 *   3. mock.webhook.post finalises   → active
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const TAG = "admin.spotlight.approve";

  router.post(
    "/admin/spotlight/approve",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: TAG });

      try {
        const { sessionId } = req.body;

        if (!sessionId) {
          log.warn("Missing sessionId");
          return res.status(400).json({
            ok: false,
            error: "sessionId_required",
          });
        }

        // Fetch spotlight payment row
        const rows = await mysqlQuery(
          `
          SELECT *
          FROM payments_oneoff
          WHERE provider_session_id = ?
            AND type = 'spotlight'
          LIMIT 1
        `,
          [sessionId]
        );

        if (!rows.length) {
          log.warn({ sessionId }, "Spotlight purchase not found");
          return res.status(404).json({
            ok: false,
            error: "not_found",
            message: "Spotlight purchase not found for this sessionId",
          });
        }

        const row = rows[0];

        if (row.status !== "pending_admin") {
          log.warn(
            { sessionId, currentStatus: row.status },
            "Spotlight not in pending_admin state"
          );

          return res.status(400).json({
            ok: false,
            error: "not_pending_admin",
            message: `Spotlight is currently '${row.status}', cannot approve`,
          });
        }

        // Move spotlight → pending_payment
        const result = await mysqlQuery(
          `
          UPDATE payments_oneoff
          SET status = 'pending_payment',
              updated_at = NOW()
          WHERE provider_session_id = ?
            AND type = 'spotlight'
            AND status = 'pending_admin'
        `,
          [sessionId]
        );

        log.info(
          {
            sessionId,
            updated: result.affectedRows,
          },
          "Spotlight moved to pending_payment"
        );

        res.json({
          ok: true,
          status: "pending_payment",
          sessionId,
          updated: result.affectedRows,
        });
        ctx.logActivity("admin.spotlight.approve", "info", req.user.uid, "Spotlight approved");
        return;
      } catch (err) {
        logger.error(
          {
            route: TAG,
            err: err?.message,
            stack: err?.stack,
          },
          "Spotlight approval failed"
        );

        return res.status(500).json({
          ok: false,
          error: "server_error",
          message: err?.message || "Unknown error",
        });
      }
    }
  );
};
