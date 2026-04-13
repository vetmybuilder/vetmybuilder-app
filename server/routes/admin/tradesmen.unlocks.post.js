/**
 * ADMIN UNLOCK FLOW (Option B – Final)
 *
 * Approve:
 *   pending_admin → pending_payment
 * Reject:
 *   pending_admin → rejected
 *
 * Actual payment activation happens LATER in mock.webhook.post.js.
 *
 * NEW:
 *   - Approve is only allowed when tradesman.verification_status = 'approved'
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  const BASE = "/admin/tradesmen/:uid/unlocks";

  // Log mount once
  if (!ctx.__logged_admin_unlocks) {
    ctx.__logged_admin_unlocks = true;
    logger.info(
      { route: `${BASE}/(approve|reject)` },
      "Mounted admin unlock approval/rejection routes"
    );
  }

  // ---------------------------------------------------------
  // APPROVE — pending_admin → pending_payment
  // ---------------------------------------------------------
  router.post(`${BASE}/approve`, auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.unlocks.approve" });

    try {
      const buyerUid = req.params.uid;
      const { projectId } = req.body;

      if (!buyerUid || !projectId) {
        log.warn({ buyerUid, projectId }, "Missing buyerUid or projectId");
        return res.status(400).json({
          error: "buyerUid_and_projectId_required",
        });
      }

      // ---- NEW: enforce that the tradesman is verified first ----
      const [tradesman] = await mysqlQuery(
        `
          SELECT verification_status
            FROM tradesmen
           WHERE user_id = ?
           LIMIT 1
        `,
        [buyerUid]
      );

      if (!tradesman) {
        log.warn({ buyerUid }, "Tradesman not found when approving unlock");
        return res.status(404).json({ error: "tradesman_not_found" });
      }

      const verificationStatus = String(
        tradesman.verification_status || ""
      ).toLowerCase();

      if (verificationStatus !== "approved") {
        log.warn(
          { buyerUid, verificationStatus },
          "Unlock approve blocked – verification not approved"
        );
        return res.status(400).json({
          error: "verification_not_approved",
          code: "VERIFICATION_REQUIRED",
          verificationStatus,
        });
      }

      log.info({ buyerUid, projectId }, "Approving unlock");

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
           WHERE user_id   = ?
             AND type      = 'unlock_contact'
             AND entity_id = ?
             AND status    = 'pending_admin'
        `,
        [buyerUid, projectId]
      );

      log.info(
        {
          buyerUid,
          projectId,
          unlockRows: r1.affectedRows,
          paymentRows: r2.affectedRows,
        },
        "Unlock approved and moved to pending_payment"
      );

      res.json({
        ok: true,
        status: "pending_payment",
        buyerUid,
        projectId,
        updatedUnlocks: r1.affectedRows,
        updatedPayments: r2.affectedRows,
      });
      ctx.logActivity("admin.unlock", "info", req.user.uid, "Tradesman unlock granted");
      return;
    } catch (e) {
      log.error({ err: e?.message, stack: e?.stack }, "Error approving unlock");
      return res
        .status(500)
        .json({ error: "server_error", message: e.message });
    }
  });

  // ---------------------------------------------------------
  // REJECT — pending_admin → rejected
  // ---------------------------------------------------------
  router.post(`${BASE}/reject`, auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.unlocks.reject" });

    try {
      const buyerUid = req.params.uid;
      const { projectId } = req.body;

      if (!buyerUid || !projectId) {
        log.warn({ buyerUid, projectId }, "Missing buyerUid or projectId");
        return res.status(400).json({
          error: "buyerUid_and_projectId_required",
        });
      }

      log.info({ buyerUid, projectId }, "Rejecting unlock");

      // 1) Update project_contact_unlocks → rejected
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

      // 2) Update payments_oneoff → rejected
      const r2 = await mysqlQuery(
        `
          UPDATE payments_oneoff
             SET status = 'rejected',
                 updated_at = NOW()
           WHERE user_id   = ?
             AND type      = 'unlock_contact'
             AND entity_id = ?
             AND status    = 'pending_admin'
        `,
        [buyerUid, projectId]
      );

      log.info(
        {
          buyerUid,
          projectId,
          unlockRows: r1.affectedRows,
          paymentRows: r2.affectedRows,
        },
        "Unlock rejected successfully"
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
      log.error({ err: e?.message, stack: e?.stack }, "Error rejecting unlock");
      return res
        .status(500)
        .json({ error: "server_error", message: e.message });
    }
  });
};
