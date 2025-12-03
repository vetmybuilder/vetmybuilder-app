/**
 * POST /api/admin/spotlight/:paymentId/approve
 *
 * Admin approval for a Spotlight one-off purchase.
 * After approval -> payment becomes active -> entitlement starts.
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  console.log("[routes] mounted: POST /admin/spotlight/:paymentId/approve");

  // Helper: check if user already has active spotlight
  async function hasActiveSpotlight(userId) {
    const rows = await mysqlQuery(
      `
      SELECT id
      FROM payments_oneoff
      WHERE user_id = ?
        AND type = 'spotlight'
        AND status = 'active'
      LIMIT 1
    `,
      [userId]
    );
    return rows.length > 0;
  }

  router.post(
    "/admin/spotlight/:paymentId/approve",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      try {
        const paymentId = Number(req.params.paymentId);
        if (!Number.isFinite(paymentId)) {
          return res.status(400).json({
            ok: false,
            error: "INVALID_ID",
            message: "Invalid paymentId",
          });
        }

        // --- Fetch payment ---
        const rows = await mysqlQuery(
          `
          SELECT *
          FROM payments_oneoff
          WHERE id = ?
            AND type = 'spotlight'
          LIMIT 1
        `,
          [paymentId]
        );

        if (!rows.length) {
          return res.status(404).json({
            ok: false,
            error: "NOT_FOUND",
            message: "Spotlight purchase not found",
          });
        }

        const row = rows[0];

        if (row.status !== "pending_admin") {
          return res.status(400).json({
            ok: false,
            error: "NOT_PENDING",
            message: "This Spotlight is not pending admin approval",
          });
        }

        const userId = row.user_id;

        // --- Rule: only one active Spotlight at a time ---
        if (await hasActiveSpotlight(userId)) {
          return res.status(409).json({
            ok: false,
            error: "ACTIVE_EXISTS",
            message: "User already has an active Spotlight",
          });
        }

        // --- Mark as admin_approved ---
        await mysqlQuery(
          `
          UPDATE payments_oneoff
          SET status = 'admin_approved',
              admin_approved_at = NOW()
          WHERE id = ?
        `,
          [paymentId]
        );

        // --- Activate Spotlight NOW ---
        await mysqlQuery(
          `
          UPDATE payments_oneoff
          SET status = 'active',
              activated_at = NOW(),
              expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
          WHERE id = ?
        `,
          [paymentId]
        );

        return res.json({
          ok: true,
          paymentId,
          activated: true,
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        });
      } catch (err) {
        console.error("[admin.spotlight.approve] error:", err);
        return res.status(500).json({
          ok: false,
          error: "SERVER_ERROR",
          message: err?.message || "Unknown error",
        });
      }
    }
  );
};
