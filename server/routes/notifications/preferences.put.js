// server/routes/notifications/preferences.put.js
/**
 * PUT /api/notifications/preferences
 * Auth: required
 * Body: { hire_updates: false, recommendations: true, ... } (partial OK)
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  const VALID_CATEGORIES = [
    "hire_updates",
    "recommendations",
    "builder_interest",
    "local_activity",
    "project_matches",
  ];

  router.put("/notifications/preferences", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "PUT /api/notifications/preferences",
    });

    const uid = req.user.uid;
    const body = req.body || {};

    const keys = Object.keys(body);
    const invalid = keys.filter((k) => !VALID_CATEGORIES.includes(k));
    if (invalid.length > 0) {
      log.warn({ uid, invalid }, "Invalid preference categories");
      return res
        .status(400)
        .json({ error: "invalid_categories", categories: invalid });
    }

    if (keys.length === 0) {
      return res.json({ ok: true });
    }

    try {
      for (const category of keys) {
        const enabled = body[category] ? 1 : 0;
        await mysqlQuery(
          `INSERT INTO notification_preferences (uid, category, push_enabled)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE push_enabled = VALUES(push_enabled)`,
          [uid, category, enabled]
        );
      }

      ctx.logActivity?.(
        "notification.preferences_updated",
        "info",
        uid,
        JSON.stringify(body)
      );

      log.info({ uid, updated: keys }, "Notification preferences updated");
      return res.json({ ok: true });
    } catch (err) {
      log.error(
        { uid, errMsg: err?.message, stack: err?.stack },
        "Error updating notification preferences"
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
