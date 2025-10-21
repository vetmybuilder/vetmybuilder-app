// server/v2/routes/recommendations/ratings.recommendations.get.js
/**
 * GET /api/v2/recommendations/ratings
 *
 * Query (one of):
 *   - projectId: number   -> returns ranked items for a project
 *   - recommendationId: number (alias: recId, id) -> returns a single score row
 *
 * Visibility:
 *  - For projectId: owner OR project is live; else 404
 *  - For recommendationId: if its project is live -> anyone; else owner or recommender only
 *
 * Response:
 *   - projectId: { items: Array<{id, name, email, phone, company, comment, isAnonymous, createdAt,
 *                               fromFriend, fromCommunity, likes, myLike, rating, score}>,
 *                  total, page, pageSize }
 *   - recommendationId: { item: { recommendationId, score } }
 */
module.exports = (router, ctx) => {
  const { db, auth, admin, extractLocationTokens } = ctx;

  // optional auth (used for recommendationId variant)
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

  // ---------- helpers ----------
  function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function likesFor(recId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM recommendation_votes WHERE recommendationId=? AND value=1`
      )
      .get(recId);
    return Number(row?.c || 0);
  }
  function recPhotoCount(recId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM recommendation_photos WHERE recommendationId=?`
      )
      .get(recId);
    return Number(row?.c || 0);
  }
  function closuresWonCount(recId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM project_closures WHERE winnerRecommendationId=?`
      )
      .get(recId);
    return Number(row?.c || 0);
  }
  function wouldUseAgainCount(recId) {
    // column added in migration 020_project_closures_would_use_again.sql
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c
           FROM project_closures
          WHERE winnerRecommendationId=? AND COALESCE(wouldUseAgain,0)=1`
      )
      .get(recId);
    return Number(row?.c || 0);
  }

  // score model (simple, tunable)
  function computeScore({
    isRecommended, // 0/1
    likes, // int
    wins, // completed projects as winner
    photos, // recommendation photos count
    wouldUseAgain, // count of positive "would use again"
  }) {
    let s = 0;
    // 1) was recommended (exists)
    s += isRecommended ? 1.0 : 0;

    // 2) completed projects (diminishing returns)
    s += Math.min(3, Math.log2(1 + wins)) * 0.8;

    // 3) community likes (diminishing)
    s += Math.min(3, Math.log2(1 + likes)) * 0.6;

    // 4) photos (threshold bump + mild scale)
    if (photos >= 2) s += 0.5 + Math.min(2, Math.log2(photos)) * 0.25;

    // 5) would use again (each is strong signal)
    s += wouldUseAgain * 0.7;

    // keep one decimal place
    return Math.round(s * 20) / 20;
  }

  // ------------- project-wide ranking -------------
  router.get("/recommendations/ratings", auth, (req, res, next) => {
    // If projectId present, handle here; otherwise pass to next handler below
    const projectId = toNum(req.query.projectId);
    if (!projectId) return next();

    const proj = db
      .prepare(`SELECT ownerUserId, status, location FROM projects WHERE id=?`)
      .get(projectId);
    if (!proj) return res.status(404).json({ error: "Not found" });

    const uid = req.user?.uid || null;
    const isOwner = uid && String(uid) === String(proj.ownerUserId);
    const isLive = String(proj.status || "").toLowerCase() === "live";
    if (!isOwner && !isLive)
      return res.status(404).json({ error: "Not found" });

    const pTok = extractLocationTokens?.(proj.location) || {};

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.max(
      1,
      Math.min(50, parseInt(String(req.query.pageSize ?? "50"), 10))
    );
    const offset = (page - 1) * pageSize;

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM recommendations WHERE projectId=?`)
      .get(projectId);

    const rows = db
      .prepare(
        `
        SELECT
          r.id, r.name, r.email, r.phone, r.company, r.comment, r.isAnonymous,
          r.createdAt, r.source, r.rating, r.recommenderUserId,
          COALESCE(v.likes,0) AS likes,
          CASE WHEN mv.userId IS NULL THEN 0 ELSE 1 END AS myLike,
          u.postcode        AS u_postcode,
          u.postcodeSector  AS u_sector,
          u.postcodeOutward AS u_outward,
          u.city            AS u_city
        FROM recommendations r
        LEFT JOIN (
          SELECT recommendationId, COUNT(*) AS likes
            FROM recommendation_votes WHERE value=1 GROUP BY recommendationId
        ) v ON v.recommendationId = r.id
        LEFT JOIN recommendation_votes mv
               ON mv.recommendationId = r.id AND mv.userId = ?
        LEFT JOIN users u ON u.uid = r.recommenderUserId
        WHERE r.projectId = ?
        LIMIT ? OFFSET ?
      `
      )
      .all(uid || "", projectId, pageSize, offset);

    function communityMatch(row) {
      if (!row.recommenderUserId) return 0;
      return Number(
        (pTok.full && row.u_postcode === pTok.full) ||
          (pTok.sector && row.u_sector === pTok.sector) ||
          (pTok.outward && row.u_outward === pTok.outward) ||
          (pTok.city &&
            row.u_city &&
            String(row.u_city).toLowerCase() ===
              String(pTok.city || "").toLowerCase())
      );
    }

    const enriched = rows.map((r) => {
      const likes = Number(r.likes || 0);
      const photos = recPhotoCount(r.id);
      const wins = closuresWonCount(r.id);
      const wouldAgain = wouldUseAgainCount(r.id);
      const score = computeScore({
        isRecommended: 1,
        likes,
        wins,
        photos,
        wouldUseAgain: wouldAgain,
      });
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone == null ? null : String(r.phone),
        company: r.company,
        comment: r.comment,
        isAnonymous: r.isAnonymous,
        createdAt: r.createdAt,
        fromFriend:
          String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0,
        fromCommunity: communityMatch(r),
        likes,
        myLike: r.myLike ? 1 : 0,
        rating: r.rating ?? null,
        score,
      };
    });

    // sort by score desc, then likes desc, then newest
    enriched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.likes || 0) !== (a.likes || 0))
        return (b.likes || 0) - (a.likes || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return res.json({
      items: enriched,
      total: totalRow.c || 0,
      page,
      pageSize,
    });
  });

  // ------------- single recommendation score -------------
  router.get("/recommendations/ratings", optionalAuth(admin), (req, res) => {
    const recId =
      toNum(req.query.recommendationId) ||
      toNum(req.query.recId) ||
      toNum(req.query.id);

    if (!recId) return res.status(400).json({ error: "Invalid id" });

    const row = db
      .prepare(
        `SELECT r.id, r.recommenderUserId, p.ownerUserId, p.status
             FROM recommendations r
             JOIN projects p ON p.id = r.projectId
            WHERE r.id = ?`
      )
      .get(recId);

    if (!row) return res.status(404).json({ error: "Not found" });

    const uid = req.user?.uid || null;
    const isOwner = uid && String(uid) === String(row.ownerUserId);
    const isRecommender = uid && String(uid) === String(row.recommenderUserId);
    const isLive = String(row.status || "").toLowerCase() === "live";

    if (!isLive && !isOwner && !isRecommender) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const likes = likesFor(recId);
    const photos = recPhotoCount(recId);
    const wins = closuresWonCount(recId);
    const wouldAgain = wouldUseAgainCount(recId);
    const score = computeScore({
      isRecommended: 1,
      likes,
      wins,
      photos,
      wouldUseAgain: wouldAgain,
    });

    return res.json({ item: { recommendationId: recId, score } });
  });
};
