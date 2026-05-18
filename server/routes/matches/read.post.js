// server/routes/matches/read.post.js
/**
 * POST /api/matches/:id/read
 *
 * Marks a single chat thread as "read up to now" for the caller.
 * Triggered by the messaging dock when it opens a chat window for an
 * unread thread — without this, the unread badge persists on the
 * Messages icon even after the user has the conversation open.
 *
 * Implementation: stamps the appropriate `*_last_read_at` column on
 * the specific swipe_interest row. Sibling of `/api/matches/read-all`
 * which does this in bulk; this endpoint targets one row by id so the
 * dock doesn't wipe read state across every other thread.
 *
 * Idempotent. Authed.
 *
 * Response: { ok: true, affected: <number> }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  router.post("/matches/:id/read", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "POST /api/matches/:id/read",
    });

    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const matchId = Number(req.params.id);
    if (!Number.isFinite(matchId) || matchId <= 0) {
      return res.status(400).json({ error: "invalid_match_id" });
    }

    // Master-operator expansion: a master may be operating a ghost
    // persona who is the actual builder_uid on the row. Without this,
    // the WHERE clause never matches a ghost-owned match for the
    // master, the UPDATE returns affectedRows=0, and the read flag
    // never gets stamped. Mirrors the selfUids fix in
    // tradesman/matches.get.js.
    let selfUids = [uid];
    try {
      const ghostRows = await mysqlQuery(
        `SELECT user_id FROM tradesmen WHERE master_uid = ?`,
        [uid],
      );
      for (const r of ghostRows || []) {
        if (r.user_id) selfUids.push(String(r.user_id));
      }
    } catch {
      // tradesmen schema absent in tests — fall back to caller uid.
    }
    const selfPh = selfUids.map(() => "?").join(",");

    try {
      const result = await mysqlQuery(
        `UPDATE swipe_interest
            SET homeowner_last_read_at =
                  CASE WHEN homeowner_uid IN (${selfPh}) THEN NOW()
                       ELSE homeowner_last_read_at
                  END,
                builder_last_read_at =
                  CASE WHEN builder_uid IN (${selfPh}) THEN NOW()
                       ELSE builder_last_read_at
                  END
          WHERE id = ?
            AND (homeowner_uid IN (${selfPh}) OR builder_uid IN (${selfPh}))`,
        [...selfUids, ...selfUids, matchId, ...selfUids, ...selfUids],
      );

      const affected = Number(result?.affectedRows ?? 0);
      if (affected === 0) {
        // Either the row doesn't exist or the caller isn't on either
        // side of it. 404 keeps the contract narrow — callers should
        // only POST for threads they actually participate in.
        return res.status(404).json({ error: "match_not_found" });
      }

      log.info(
        { uid, matchId, affected },
        "Match marked as read",
      );

      return res.json({ ok: true, affected });
    } catch (err) {
      log.error(
        { uid, matchId, errMsg: err?.message, stack: err?.stack },
        "Failed to mark match as read",
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
