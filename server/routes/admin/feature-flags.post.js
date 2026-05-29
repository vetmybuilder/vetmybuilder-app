// POST /api/admin/feature-flags/:key
// Admin: toggle a feature flag. Body: { enabled: boolean }.
const { withRequest } = require("../../lib/logger");
const { FLAG_DEFINITIONS, clearFlagCache } = require("../../lib/featureFlags");
const { logAdminAction } = require("../../lib/adminAuditLog");

const VALID_KEYS = new Set(FLAG_DEFINITIONS.map((d) => d.key));

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.post("/admin/feature-flags/:key", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.feature-flags" });
    const key = String(req.params.key || "");
    const enabled = req.body?.enabled === true || req.body?.enabled === 1;

    if (!VALID_KEYS.has(key)) {
      return res.status(400).json({ error: "unknown_flag" });
    }

    try {
      const def = FLAG_DEFINITIONS.find((d) => d.key === key);
      await mysqlQuery(
        `INSERT INTO feature_flags (flag_key, enabled, description, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_by = VALUES(updated_by)`,
        [key, enabled ? 1 : 0, def?.description || null, req.user.uid],
      );
      clearFlagCache();

      res.json({ ok: true, key, enabled });
      ctx.logActivity(
        "admin.feature_flag",
        "info",
        req.user.uid,
        `Flag ${key} -> ${enabled ? "on" : "off"}`,
      );
      await logAdminAction({
        mysqlQuery,
        actorUid: req.user.uid,
        targetUid: null,
        action: "feature_flag_toggle",
        details: { key, enabled },
        log,
      });
    } catch (err) {
      log.error({ err: err?.message }, "feature flag toggle failed");
      res.status(500).json({ error: "server_error" });
    }
  });
};
