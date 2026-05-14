// server/routes/matches/read-all.post.js
/**
 * POST /api/matches/read-all
 *
 * Marks every chat thread the caller is part of as "read up to now".
 * Powers the "Mark all as read" link on the Inbox Messages tab.
 *
 * Implementation: stamps the appropriate `*_last_read_at` column on
 * every swipe_interest row the caller participates in. The unread
 * query in `matches/list.get.js` already factors in these timestamps
 * by taking MAX(my last message, my last_read_at), so any message
 * older than the stamp counts as read.
 *
 * Idempotent. Authed.
 *
 * Response: { ok: true, affected: <number> }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  router.post("/matches/read-all", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "POST /api/matches/read-all",
    });

    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    try {
      // A single UPDATE covers both viewer roles: if the caller is the
      // homeowner on the match, the homeowner column gets stamped; if
      // they're the builder, the builder column does. A user can only
      // be on one side of a given match, so the CASE never double-
      // writes the same row.
      const result = await mysqlQuery(
        `UPDATE swipe_interest
            SET homeowner_last_read_at =
                  CASE WHEN homeowner_uid = ? THEN NOW()
                       ELSE homeowner_last_read_at
                  END,
                builder_last_read_at =
                  CASE WHEN builder_uid = ? THEN NOW()
                       ELSE builder_last_read_at
                  END
          WHERE homeowner_uid = ? OR builder_uid = ?`,
        [uid, uid, uid, uid],
      );

      ctx.logActivity?.(
        "matches.read_all",
        "info",
        uid,
        `All chat threads marked read for ${uid}`,
      );

      log.info(
        { uid, affected: result?.affectedRows ?? null },
        "All matches marked as read",
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
        "Failed to mark all matches as read",
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
