// server/v2/routes/recommendations/recommendation.get.js
/**
 * GET /api/v2/recommendations/:id
 * Auth: optional
 * Visibility:
 *   - If project is live: anyone
 *   - Else: owner or recommender only
 * Response: { recommendation }
 */
module.exports = (router, ctx) => {
  const { db, admin } = ctx;

  // optionalAuth (same as monolith)
  function optionalAuth(adminInstance) {
    return async (req, _res, next) => {
      try {
        const h = req.headers?.authorization || "";
        if (h.startsWith("Bearer ")) {
          const token = h.slice(7);
          const decoded = await adminInstance.auth().verifyIdToken(token);
          req.user = { uid: decoded.uid, email: decoded.email || null };
        }
      } catch {}
      next();
    };
  }

  const PUBLIC_API_BASE =
    ctx.PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    `http://localhost:${process.env.PORT || 8787}`;

  router.get("/recommendations/:id", optionalAuth(admin), (req, res) => {
    const recId = Number(req.params.id);
    if (!Number.isFinite(recId)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const row = db
      .prepare(
        `
        SELECT r.*, p.id AS projectId, p.name AS projectName, p.ownerUserId, p.status AS projectStatus,
          COALESCE((
            SELECT COUNT(*) FROM recommendation_votes v
             WHERE v.recommendationId = r.id AND v.value = 1
          ), 0) AS likes
        FROM recommendations r
        JOIN projects p ON p.id = r.projectId
        WHERE r.id = ?
      `
      )
      .get(recId);

    if (!row) return res.status(404).json({ error: "Not found" });

    const uid = req.user?.uid || null;
    const isOwner = uid && uid === row.ownerUserId;
    const isLive = String(row.projectStatus || "").toLowerCase() === "live";

    if (!isLive) {
      const isRecommender = uid && uid === row.recommenderUserId;
      if (!isOwner && !isRecommender) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const myLike =
      uid &&
      db
        .prepare(
          `SELECT 1 FROM recommendation_votes
            WHERE recommendationId = ? AND userId = ? AND value = 1`
        )
        .get(recId, uid)
        ? 1
        : 0;

    const photoRows = db
      .prepare(
        `SELECT id, filePath AS fp, mime
           FROM recommendation_photos
          WHERE recommendationId = ?
          ORDER BY id ASC`
      )
      .all(recId);

    const photos = photoRows.map((p) => {
      const abs = new URL(p.fp, PUBLIC_API_BASE).toString();
      return { id: String(p.id), url: abs, thumb: abs };
    });

    const recommendation = {
      id: row.id,
      company: row.company,
      comment: row.comment,
      createdAt: row.createdAt,
      name: row.name,
      email: row.email,
      phone: row.phone == null ? null : String(row.phone),
      isAnonymous: row.isAnonymous,
      likes: row.likes,
      myLike,
      rating: row.rating ?? null,
      fromFriend: String(row.source || "").toLowerCase() === "magic" ? 1 : 0,
      fromCommunity:
        String(row.source || "").toLowerCase() === "community" ? 1 : 0,
      photos,
      project: { id: row.projectId, name: row.projectName },
    };

    return res.json({ recommendation });
  });
};
