// server/v2/routes/notifications/notifications.get.js
/**
 * GET /api/v2/notifications
 * Auth: required
 * Query: ?limit=
 * Response: { items, unread }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  function parseLimit(v, def = 50, min = 1, max = 500) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }

  router.get("/notifications", auth, (req, res) => {
    const uid = req.user.uid;
    const limit = parseLimit(req.query.limit, 50);

    const items = db
      .prepare(
        `SELECT id, type, message, projectId, linkPath, createdAt, readAt
           FROM notifications
          WHERE userId = ?
          ORDER BY createdAt DESC
          LIMIT ?`
      )
      .all(uid, limit);

    const unread = db
      .prepare(
        `SELECT COUNT(*) AS c FROM notifications WHERE userId = ? AND readAt IS NULL`
      )
      .get(uid).c;

    return res.json({ items, unread });
  });
};
