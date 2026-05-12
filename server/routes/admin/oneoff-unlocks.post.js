// server/routes/admin/oneoff-unlocks.post.js
//
// Admin tools for managing project_contact_unlocks rows directly -
// granting a free per-project unlock to a tradesman, or revoking one
// they already hold. Mirrors the builder-subscriptions admin endpoints
// but at the per-project granularity.
//
// Endpoints:
//   POST /api/admin/tradesmen/:uid/oneoff-unlocks/grant
//        body: { projectId }
//        Inserts a project_contact_unlocks row with status='active'.
//        Idempotent: re-running upgrades any existing row to 'active'.
//
//   POST /api/admin/tradesmen/:uid/oneoff-unlocks/revoke
//        body: { projectId }
//        Deletes the row outright (admin grants are not paid records,
//        so there's no audit value in keeping a 'rejected' shell).
//
//   GET  /api/admin/tradesmen/:uid/oneoff-unlocks
//        Returns { items: [{ projectId, projectName, status, approvedAt }] }
//        for active rows belonging to this tradesman.

const { logAdminAction } = require("../../lib/adminAuditLog");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const { requireAdmin } = require("../../lib/roles");
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post(
    "/admin/tradesmen/:uid/oneoff-unlocks/grant",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const buyerUid = String(req.params?.uid || "").trim();
      const projectId = Number(req.body?.projectId || 0);
      if (!buyerUid) return res.status(400).json({ error: "uid_required" });
      if (!Number.isFinite(projectId) || projectId <= 0) {
        return res.status(400).json({ error: "projectId_required" });
      }

      try {
        const projectRows = await mysqlQuery(
          `SELECT id FROM projects WHERE id = ? LIMIT 1`,
          [projectId],
        );
        if (projectRows.length === 0) {
          return res.status(404).json({ error: "project_not_found" });
        }

        const sessionId = `admin_grant_oneoff_${Date.now()}_${Math.random()
          .toString(16)
          .slice(2, 8)}`;

        await mysqlQuery(
          `INSERT INTO project_contact_unlocks
             (project_id, buyer_uid, session_id, amount, currency, status,
              created_at, approved_at)
           VALUES (?, ?, ?, 0, 'GBP', 'active', NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             status = 'active',
             approved_at = NOW(),
             session_id = VALUES(session_id)`,
          [projectId, buyerUid, sessionId],
        );

        ctx.logActivity?.(
          "admin.oneoff_unlock.grant",
          "info",
          req.user?.uid,
          `Granted unlock for project ${projectId} to ${buyerUid}`,
        );

        await logAdminAction({
          mysqlQuery,
          actorUid: req.user?.uid,
          targetUid: buyerUid,
          action: "unlock_grant",
          details: { projectId },
          log,
        });

        return res.json({ ok: true, buyerUid, projectId });
      } catch (e) {
        log.error?.(`[admin/oneoff-unlocks/grant] ${e?.message || e}`);
        return res.status(500).json({ error: "grant_failed" });
      }
    },
  );

  router.post(
    "/admin/tradesmen/:uid/oneoff-unlocks/revoke",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const buyerUid = String(req.params?.uid || "").trim();
      const projectId = Number(req.body?.projectId || 0);
      if (!buyerUid) return res.status(400).json({ error: "uid_required" });
      if (!Number.isFinite(projectId) || projectId <= 0) {
        return res.status(400).json({ error: "projectId_required" });
      }

      try {
        const result = await mysqlQuery(
          `DELETE FROM project_contact_unlocks
            WHERE project_id = ? AND buyer_uid = ?`,
          [projectId, buyerUid],
        );

        ctx.logActivity?.(
          "admin.oneoff_unlock.revoke",
          "info",
          req.user?.uid,
          `Revoked unlock for project ${projectId} from ${buyerUid}`,
        );

        await logAdminAction({
          mysqlQuery,
          actorUid: req.user?.uid,
          targetUid: buyerUid,
          action: "unlock_revoke",
          details: { projectId },
          log,
        });

        return res.json({
          ok: true,
          buyerUid,
          projectId,
          deleted: result?.affectedRows ?? 0,
        });
      } catch (e) {
        log.error?.(`[admin/oneoff-unlocks/revoke] ${e?.message || e}`);
        return res.status(500).json({ error: "revoke_failed" });
      }
    },
  );

  router.get(
    "/admin/tradesmen/:uid/oneoff-unlocks",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const buyerUid = String(req.params?.uid || "").trim();
      if (!buyerUid) return res.status(400).json({ error: "uid_required" });

      try {
        const rows = await mysqlQuery(
          `SELECT u.project_id  AS projectId,
                  u.status      AS status,
                  u.approved_at AS approvedAt,
                  u.amount      AS amountPence,
                  p.name        AS projectName,
                  p.status      AS projectStatus
             FROM project_contact_unlocks u
             LEFT JOIN projects p ON p.id = u.project_id
            WHERE u.buyer_uid = ?
              AND u.status IN ('active', 'paid')
            ORDER BY u.approved_at DESC`,
          [buyerUid],
        );

        return res.json({ items: rows });
      } catch (e) {
        log.error?.(`[admin/oneoff-unlocks/list] ${e?.message || e}`);
        return res.status(500).json({ error: "list_failed" });
      }
    },
  );
};
