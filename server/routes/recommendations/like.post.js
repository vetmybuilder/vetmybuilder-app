// server/v2/routes/recommendations/like.post.js
/**
 * POST /api/v2/recommendations/:id/like
 * Auth: required
 * Effect: one like per user (INSERT OR IGNORE)
 * Response: { ok: true, recommendationId, likes, myLike }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.post("/recommendations/:id/like", auth, (req, res) => {
    const userId = req.user.uid;
    const recId = Number(req.params.id);
    if (!Number.isFinite(recId)) {
      return res.status(400).json({ error: "Bad id" });
    }

    const rec = db
      .prepare(`SELECT id, projectId FROM recommendations WHERE id = ?`)
      .get(recId);
    if (!rec)
      return res.status(404).json({ error: "Recommendation not found" });

    const proj = db
      .prepare(`SELECT ownerUserId FROM projects WHERE id = ?`)
      .get(rec.projectId);
    if (!proj) return res.status(404).json({ error: "Project not found" });
    if (String(proj.ownerUserId) === String(userId)) {
      return res.status(403).json({ error: "Owner cannot like" });
    }

    db.prepare(
      `INSERT OR IGNORE INTO recommendation_votes (recommendationId, userId, value)
       VALUES (?, ?, 1)`
    ).run(recId, userId);

    const row = db
      .prepare(
        `SELECT COUNT(*) AS likes
           FROM recommendation_votes
          WHERE recommendationId = ? AND value = 1`
      )
      .get(recId);

    const myLike = !!db
      .prepare(
        `SELECT 1 FROM recommendation_votes
          WHERE recommendationId = ? AND userId = ? LIMIT 1`
      )
      .get(recId, userId);

    return res.json({
      ok: true,
      recommendationId: recId,
      likes: row.likes || 0,
      myLike,
    });
  });
};
