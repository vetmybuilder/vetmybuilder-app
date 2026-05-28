// POST /api/admin/tradesmen/:uid/profile-public
// Body: { enabled: boolean }
// Toggles whether the tradesperson's public profile page is live.
// On enable, fires the "profile live" notification to the tradesperson.

const { withRequest } = require("../../lib/logger");
const { notifyProfileLive } = require("../../lib/notifyProfileLive");
const { logAdminAction } = require("../../lib/adminAuditLog");

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const { requireAdmin } = require("../../lib/roles");
  const TAG = "admin.tradesmen.profile-public";

  router.post(
    "/admin/tradesmen/:uid/profile-public",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: TAG });
      const uid = String(req.params.uid || "");
      const enabled = req.body?.enabled === true || req.body?.enabled === 1;

      if (!uid) return res.status(400).json({ error: "uid required" });

      try {
        const rows = await mysqlQuery(
          `SELECT user_id, slug, status FROM tradesmen WHERE user_id = ? LIMIT 1`,
          [uid],
        );
        const row = rows[0];
        if (!row) return res.status(404).json({ error: "tradesman not found" });

        if (enabled && !row.slug) {
          return res.status(400).json({
            error: "no_slug",
            message: "This tradesperson has no profile slug yet. Activate the account first.",
          });
        }

        await mysqlQuery(
          `UPDATE tradesmen SET profile_public = ?, updated_at = NOW() WHERE user_id = ?`,
          [enabled ? 1 : 0, uid],
        );

        if (enabled) {
          notifyProfileLive({
            mysqlQuery,
            uid,
            slug: row.slug,
            broadcastNotification: ctx.broadcastNotification,
          });
        }

        res.json({ ok: true, profile_public: enabled, slug: row.slug });
        ctx.logActivity(
          "admin.tradesman.profile_public",
          "info",
          req.user.uid,
          `Tradesman ${uid} profile ${enabled ? "published" : "unpublished"}`,
        );
        await logAdminAction({
          mysqlQuery,
          actorUid: req.user.uid,
          targetUid: uid,
          action: "profile_public",
          details: { enabled },
          log,
        });
      } catch (err) {
        log.error({ err: err?.message }, "profile-public toggle failed");
        res.status(500).json({ error: "server_error" });
      }
    },
  );
};
