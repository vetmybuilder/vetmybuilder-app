/**
 * GET /api/projects/:id/recommendations
 * Auth: required
 * Visibility: owner OR project is live OR completed; else 404
 * Query: page, pageSize
 *
 * Returns recommendations already RANKED by the composite `score`
 * (from SQL view: v_recommendation_scores) and includes:
 *   - likes, myLike (for current user)
 *   - fromCommunity (as exposed by the view, adjusted for magic-link "friend")
 *   - fromFriend (derived)
 *   - score (rounded)
 *
 * NOTE:
 *   - We DO NOT return any recommender PII (name/email/phone)
 */
module.exports = (router, ctx) => {
  const { db, auth, extractLocationTokens } = ctx;

  router.get("/projects/:id/recommendations", auth, (req, res) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    // visibility
    const proj = db
      .prepare(
        `SELECT ownerUserId, status, location
           FROM projects
          WHERE id = ?`
      )
      .get(projectId);

    if (!proj) return res.status(404).json({ error: "Not found" });

    const statusLc = String(proj.status || "").toLowerCase();
    const isLive = statusLc === "live"; // ✅ live means "live"
    const isCompleted = statusLc === "completed"; // ✅ add missing variable
    const uid = req.user?.uid || null;
    const isOwner = !!uid && String(uid) === String(proj.ownerUserId);

    if (!isOwner && !isLive && !isCompleted) {
      return res.status(404).json({ error: "Not found" });
    }

    // paging
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.max(
      1,
      Math.min(50, parseInt(String(req.query.pageSize ?? "10"), 10))
    );
    const offset = (page - 1) * pageSize;

    // total
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM recommendations WHERE projectId = ?`)
      .get(projectId);
    const total = Number(totalRow?.c || 0);

    // ranked list
    // NOTE:
    //  - v_recommendation_scores exposes:
    //      recommendationId, score, likes_count, photos_count, completed_count,
    //      would_use_again_count, fromCommunity
    //  - myLike is per-user from recommendation_votes
    const userId = String(uid || "");

    const rows = db
      .prepare(
        `
        SELECT
          r.id,
          r.projectId,
          r.createdAt,
          r.recommenderUserId,
          r.source,
          r.isAnonymous,
          r.company,
          r.comment,
          r.rating,
          -- aggregates / derived
          COALESCE(vrs.likes_count, 0)                 AS likes,
          CASE
            WHEN EXISTS (
              SELECT 1
                FROM recommendation_votes rv
               WHERE rv.recommendationId = r.id
                 AND rv.userId = ?
                 AND rv.value = 1
            ) THEN 1 ELSE 0
          END                                           AS myLike,
          COALESCE(vrs.fromCommunity, 0)               AS fromCommunity,
          ROUND(COALESCE(vrs.score, 0), 3)             AS score
        FROM recommendations r
        LEFT JOIN v_recommendation_scores vrs
               ON vrs.recommendationId = r.id
        WHERE r.projectId = ?
        ORDER BY
          COALESCE(vrs.score, 0) DESC,
          COALESCE(vrs.likes_count, 0) DESC,
          r.createdAt DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(userId, projectId, pageSize, offset);

    // (Keep extractLocationTokens around if other callers use it,
    // ranking now comes from the SQL view so we don't recompute here.)
    void extractLocationTokens;

    const items = rows.map((r) => {
      const isMagic = String(r.source || "").toLowerCase() === "magic";
      const hasUser = r.recommenderUserId != null;
      const isAnonFlag = !!r.isAnonymous;

      // Business rules:
      //  - Friend  = unregistered / anonymous via magic link
      //  - Neighbourhood = any other recommender (registered user)
      const fromFriend = isMagic && (!hasUser || isAnonFlag);

      // We only keep fromCommunity when it's NOT a "friend" rec
      const fromCommunity = !fromFriend && (r.fromCommunity ? 1 : 0);

      return {
        id: r.id,
        // NO recommender PII here:
        // name: r.name,
        // email: r.email,
        // phone: r.phone == null ? null : String(r.phone),
        company: r.company,
        comment: r.comment,
        createdAt: r.createdAt,
        rating: r.rating ?? null,
        likes: r.likes,
        myLike: r.myLike ? 1 : 0,
        fromFriend,
        fromCommunity,
        score: Number(r.score) || 0,
      };
    });

    return res.json({ items, total, page, pageSize });
  });
};
