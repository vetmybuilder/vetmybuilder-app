// server/routes/notifications/read-all.post.js
/**
 * POST /api/notifications/read-all
 * Auth: required
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  router.post("/notifications/read-all", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "POST /api/notifications/read-all",
    });

    log.debug({ uid: req.user.uid }, "Marking all notifications as read");

    try {
      const result = await mysqlQuery(
        `UPDATE notifications
            SET readAt = NOW()
          WHERE userId = ?
            AND readAt IS NULL`,
        [req.user.uid]
      );

      ctx.logActivity?.("notification.read_all", "info", req.user.uid, `All notifications marked read for ${req.user.uid}`);

      log.info(
        {
          uid: req.user.uid,
          affected: result?.affectedRows ?? null,
        },
        "All notifications marked as read"
      );

      return res.json({ ok: true });
    } catch (err) {
      log.error(
        {
          uid: req.user.uid,
          errMsg: err?.message,
          stack: err?.stack,
        },
        "Failed to mark all notifications as read"
      );

      return res.status(500).json({ error: "internal_error" });
    }
  });
};
