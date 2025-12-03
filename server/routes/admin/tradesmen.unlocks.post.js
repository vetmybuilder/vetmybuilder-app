/**
 * ADMIN UNLOCK FLOW (Option B – Final)
 *
 * Approve:
 *   pending_admin → pending_payment
 * Reject:
 *   pending_admin → rejected
 *
 * Actual payment activation happens LATER in mock.webhook.post.js.
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  const BASE = "/admin/tradesmen/:uid/unlocks";

  // ---------------------------------------------------------
  // APPROVE — pending_admin → pending_payment
  // ---------------------------------------------------------
  router.post(
    `${BASE}/approve`,
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      try {
        const buyerUid = req.params.uid;
        const { projectId } = req.body;

        if (!buyerUid || !projectId) {
          return res.status(400).json({
            error: "buyerUid_and_projectId_required",
          });
        }

        // 1) Update project_contact_unlocks
        const r1 = await mysqlQuery(
          `
          UPDATE project_contact_unlocks
             SET status = 'pending_payment',
                 updated_at = NOW()
           WHERE project_id = ?
             AND buyer_uid  = ?
             AND status     = 'pending_admin'
        `,
          [projectId, buyerUid]
        );

        // 2) Update payments_oneoff
        const r2 = await mysqlQuery(
          `
          UPDATE payments_oneoff
             SET status = 'pending_payment',
                 updated_at = NOW()
           WHERE user_id = ?
             AND type = 'unlock_contact'
             AND entity_id = ?
             AND status = 'pending_admin'
        `,
          [buyerUid, projectId]
        );

        return res.json({
          ok: true,
          status: "pending_payment",
          buyerUid,
          projectId,
          updatedUnlocks: r1.affectedRows,
          updatedPayments: r2.affectedRows,
        });
      } catch (e) {
        console.error("[admin.unlocks.approve] error:", e);
        return res.status(500).json({ error: "server_error", message: e.message });
      }
    }
  );

  // ---------------------------------------------------------
  // REJECT — pending_admin → rejected
  // ---------------------------------------------------------
  router.post(
    `${BASE}/reject`,
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      try {
        const buyerUid = req.params.uid;
        const { projectId } = req.body;

        if (!buyerUid || !projectId) {
          return res.status(400).json({
            error: "buyerUid_and_projectId_required",
          });
        }

        // 1) project_contact_unlocks → rejected
        const r1 = await mysqlQuery(
          `
          UPDATE project_contact_unlocks
             SET status = 'rejected',
                 updated_at = NOW()
           WHERE project_id = ?
             AND buyer_uid  = ?
             AND status     = 'pending_admin'
        `,
          [projectId, buyerUid]
        );

        // 2) payments_oneoff → rejected
        const r2 = await mysqlQuery(
          `
          UPDATE payments_oneoff
             SET status = 'rejected',
                 updated_at = NOW()
           WHERE user_id = ?
             AND type = 'unlock_contact'
             AND entity_id = ?
             AND status = 'pending_admin'
        `,
          [buyerUid, projectId]
        );

        return res.json({
          ok: true,
          status: "rejected",
          buyerUid,
          projectId,
          updatedUnlocks: r1.affectedRows,
          updatedPayments: r2.affectedRows,
        });
      } catch (e) {
        console.error("[admin.unlocks.reject] error:", e);
        return res.status(500).json({ error: "server_error", message: e.message });
      }
    }
  );

  console.log("[routes] mounted: POST /admin/tradesmen/:uid/unlocks/{approve|reject}");
};