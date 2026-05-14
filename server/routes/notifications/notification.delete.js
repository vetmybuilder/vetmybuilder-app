// server/routes/notifications/notification.delete.js
/**
 * DELETE /api/notifications/:id
 * Auth: required
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  router.delete("/notifications/:id", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "DELETE /api/notifications/:id",
    });

    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      log.warn({ id: req.params.id }, "Invalid notification ID");
      return res.status(400).json({ error: "Invalid id" });
    }

    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Check notification exists and belongs to this user
      const rows = await mysqlQuery(
        `SELECT userId
           FROM notifications
          WHERE id = ?`,
        [id]
      );

      const row = rows[0];

      if (!row) {
        log.warn({ id, requester: uid }, "Notification not found");
        return res.status(404).json({ error: "Not found" });
      }

      if (String(row.userId) !== String(uid)) {
        log.warn(
          { id, owner: row.userId, requester: uid },
          "Notification not owned by user"
        );
        return res.status(403).json({ error: "Forbidden" });
      }

      // Soft-delete: stamp dismissed_at. The Activity tab's GET query
      // already filters `dismissed_at IS NULL`, so the row disappears
      // from the user's inbox while staying on disk for analytics,
      // audit, and future "Undo / show dismissed" affordances.
      // Idempotent — re-dismissing a dismissed row is a no-op.
      await mysqlQuery(
        `UPDATE notifications
            SET dismissed_at = NOW()
          WHERE id = ?
            AND dismissed_at IS NULL`,
        [id],
      );

      ctx.logActivity?.(
        "notification.dismissed",
        "info",
        uid,
        `Notification #${id} dismissed`
      );

      log.info({ id, uid }, "Notification soft-dismissed");
      return res.json({ ok: true });
    } catch (err) {
      log.error(
        {
          id,
          errMsg: err?.message,
          stack: err?.stack,
        },
        "Error deleting notification"
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
