// server/routes/notifications/dismiss-all.post.js
/**
 * POST /api/notifications/dismiss-all
 *
 * Soft-dismiss every notification belonging to the caller that isn't
 * already dismissed. Powers the "Clear all" action on the Inbox
 * Activity tab. Idempotent — rows already stamped stay as-is.
 *
 * Auth: required
 * Response: { ok: true, affected: <number> }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  router.post("/notifications/dismiss-all", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "POST /api/notifications/dismiss-all",
    });

    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    try {
      const result = await mysqlQuery(
        `UPDATE notifications
            SET dismissed_at = NOW()
          WHERE userId = ?
            AND dismissed_at IS NULL`,
        [uid],
      );

      ctx.logActivity?.(
        "notification.dismiss_all",
        "info",
        uid,
        `All notifications dismissed for ${uid}`,
      );

      log.info(
        { uid, affected: result?.affectedRows ?? null },
        "All notifications soft-dismissed",
      );

      return res.json({
        ok: true,
        affected: Number(result?.affectedRows ?? 0),
      });
    } catch (err) {
      log.error(
        {
          uid,
          errMsg: err?.message,
          stack: err?.stack,
        },
        "Failed to dismiss all notifications",
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
