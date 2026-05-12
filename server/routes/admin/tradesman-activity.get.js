// server/routes/admin/tradesman-activity.get.js
//
// GET /api/admin/tradesmen/:uid/activity
// Admin-only. Returns the audit-log timeline for one tradesperson, plus
// two derived "profile created" / "profile updated" entries from the
// tradesmen table so the Activity tab has something to show even for
// trades who have never been touched by an admin.
//
// Response shape:
//   {
//     events: [
//       { id, action, actorUid, details, createdAt },
//       ...
//     ],
//     profile: {
//       createdAt: string | null,
//       updatedAt: string | null,
//     }
//   }

const { requireAdmin } = require("../../lib/roles");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");
  const log = ctx.log || console;
  const TAG = "[admin/tradesman-activity.get]";
  const adminGuard = requireAdmin(ctx);

  router.get(
    "/admin/tradesmen/:uid/activity",
    auth,
    adminGuard,
    async (req, res) => {
      const uid = String(req.params.uid || "").trim();
      if (!uid) {
        return res.status(400).json({ ok: false, error: "missing_uid" });
      }

      try {
        const auditRows = await mysqlQuery(
          `SELECT id, actor_uid AS actorUid, action,
                  details_json AS detailsJson, created_at AS createdAt
             FROM admin_audit_log
            WHERE target_uid = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 200`,
          [uid],
        );

        const profileRows = await mysqlQuery(
          `SELECT created_at AS createdAt, updated_at AS updatedAt
             FROM tradesmen
            WHERE user_id = ?
            LIMIT 1`,
          [uid],
        );

        const profile = profileRows?.[0] || { createdAt: null, updatedAt: null };

        const events = (auditRows || []).map((r) => {
          let details = null;
          if (r.detailsJson) {
            try {
              details = JSON.parse(r.detailsJson);
            } catch {
              details = null;
            }
          }
          return {
            id: Number(r.id),
            action: String(r.action || ""),
            actorUid: r.actorUid || null,
            details,
            createdAt: r.createdAt || null,
          };
        });

        return res.json({
          events,
          profile: {
            createdAt: profile.createdAt || null,
            updatedAt: profile.updatedAt || null,
          },
        });
      } catch (err) {
        log.error?.(`${TAG} failed`, { error: err?.message, uid });
        return res.status(500).json({ ok: false, error: "fetch_failed" });
      }
    },
  );

  if (!ctx.__logged_admin_tradesman_activity) {
    ctx.__logged_admin_tradesman_activity = true;
    log.info?.(`[routes] mounted: /admin/tradesmen/:uid/activity`);
  }
};
