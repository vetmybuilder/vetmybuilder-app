// server/routes/notifications/notifications.get.js
/**
 * GET /api/notifications
 * Auth: required
 * Query: ?limit=
 * Response: { items, unread }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  function parseLimit(v, def = 50, min = 1, max = 500) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }

  router.get("/notifications", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "GET /api/notifications",
    });

    const uid = req.user.uid;
    const limit = parseLimit(req.query.limit, 50);

    log.debug({ uid, limit }, "Fetching notifications");

    try {
      // Fetch notifications (LIMIT is safe because it's clamped)
      const items = await mysqlQuery(
        `SELECT id, type, message, projectId, linkPath, createdAt, readAt
           FROM notifications
          WHERE userId = ?
            AND createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
          ORDER BY createdAt DESC
          LIMIT ${limit}`,
        [uid]
      );

      const unreadRows = await mysqlQuery(
        `SELECT COUNT(*) AS c
           FROM notifications
          WHERE userId = ?
            AND readAt IS NULL
            AND createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [uid]
      );

      const unread = unreadRows[0]?.c || 0;

      log.info(
        { uid, count: items.length, unread },
        "Notifications fetched successfully"
      );

      return res.json({ items, unread });
    } catch (err) {
      log.error(
        {
          uid,
          errMsg: err?.message,
          stack: err?.stack,
        },
        "Error fetching notifications"
      );

      return res.status(500).json({ error: "internal_error" });
    }
  });
};
