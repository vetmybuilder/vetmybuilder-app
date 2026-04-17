// server/routes/notifications/preferences.get.js
/**
 * GET /api/notifications/preferences
 * Auth: required
 * Response: { preferences: { hire_updates: true, ... } }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  const DEFAULTS = {
    hire_updates: true,
    recommendations: true,
    builder_interest: true,
    local_activity: false,
    project_matches: true,
  };

  router.get("/notifications/preferences", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "GET /api/notifications/preferences",
    });

    const uid = req.user.uid;

    try {
      const rows = await mysqlQuery(
        `SELECT category, push_enabled FROM notification_preferences WHERE uid = ?`,
        [uid]
      );

      const preferences = { ...DEFAULTS };
      for (const row of rows) {
        if (row.category in DEFAULTS) {
          preferences[row.category] = Boolean(row.push_enabled);
        }
      }

      log.debug({ uid }, "Notification preferences fetched");
      return res.json({ preferences });
    } catch (err) {
      log.error(
        { uid, errMsg: err?.message, stack: err?.stack },
        "Error fetching notification preferences"
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
