// server/routes/notifications/notification.read.post.js
/**
 * POST /api/notifications/:id/read
 * Auth: required
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  router.post("/notifications/:id/read", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "POST /api/notifications/:id/read",
    });

    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      log.warn({ id: req.params.id }, "Invalid notification ID");
      return res.status(400).json({ error: "Invalid id" });
    }

    try {
      // Check notification belongs to this user
      const rows = await mysqlQuery(
        `SELECT userId
           FROM notifications
          WHERE id = ?`,
        [id]
      );

      const row = rows[0];

      if (!row || String(row.userId) !== String(req.user.uid)) {
        log.warn(
          {
            id,
            owner: row?.userId,
            requester: req.user.uid,
          },
          "Notification not found or not owned by user"
        );

        return res.status(404).json({ error: "Not found" });
      }

      // Mark as read
      await mysqlQuery(
        `UPDATE notifications
            SET readAt = NOW()
          WHERE id = ?`,
        [id]
      );

      log.info({ id }, "Notification marked as read");
      return res.json({ ok: true });
    } catch (err) {
      log.error(
        {
          id,
          errMsg: err?.message,
          stack: err?.stack,
        },
        "Error marking notification as read"
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
