// server/routes/recommendations/like.post.js

/**
 * POST /api/recommendations/:id/like
 * Auth: required
 * Effect: one like per user (INSERT IGNORE semantics)
 * Response: { ok: true, recommendationId, likes, myLike }
 */

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const log = ctx.log || console;
  const TAG = "[recommendations.like.post]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post("/recommendations/:id/like", auth, async (req, res) => {
    const userId = req.user?.uid;
    const recId = Number(req.params.id);

    log.info?.(`${TAG} start`, { userId, recId });

    try {
      if (!Number.isFinite(recId)) {
        log.warn?.(`${TAG} bad id`, { recId });
        return res.status(400).json({ error: "Bad id" });
      }

      // Ensure recommendation exists
      const recRows = await mysqlQuery(
        `SELECT id, projectId
           FROM recommendations
          WHERE id = ?
          LIMIT 1`,
        [recId]
      );
      const rec = recRows[0];

      if (!rec) {
        log.warn?.(`${TAG} recommendation not found`, { recId });
        return res.status(404).json({ error: "Recommendation not found" });
      }

      // INSERT IGNORE → one like per user
      await mysqlQuery(
        `INSERT IGNORE INTO recommendation_votes (recommendationId, userId, value)
         VALUES (?, ?, 1)`,
        [recId, userId]
      );

      // Count total likes
      const likeCountRows = await mysqlQuery(
        `SELECT COUNT(*) AS likes
           FROM recommendation_votes
          WHERE recommendationId = ? AND value = 1`,
        [recId]
      );
      const likes = Number(likeCountRows[0]?.likes || 0);

      // Has THIS user liked it?
      const myLikeRows = await mysqlQuery(
        `SELECT 1
           FROM recommendation_votes
          WHERE recommendationId = ? AND userId = ? AND value = 1
          LIMIT 1`,
        [recId, userId]
      );
      const myLike = myLikeRows.length > 0;

      log.info?.(`${TAG} like updated`, { recId, userId, likes, myLike });

      res.json({
        ok: true,
        recommendationId: recId,
        likes,
        myLike,
      });
      ctx.logActivity("rec.like", "info", req.user?.uid || "guest", `Liked rec #${recId}`);
      return;
    } catch (err) {
      log.error?.(`${TAG} error`, err);
      return res.status(500).json({ error: "Internal error toggling like" });
    }
  });
};
