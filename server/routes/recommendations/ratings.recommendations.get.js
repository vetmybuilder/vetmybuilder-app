/**
 * GET /api/recommendations/ratings
 *
 * Query (one of):
 *   - projectId: number   -> returns ranked items for a project
 *   - recommendationId: number (alias: recId, id) -> returns a single score row
 *
 * Visibility:
 *  - For projectId: owner OR project is live OR completed; else 404
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

  // ---------- auth helpers ----------
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

  // ---------- tiny utils ----------
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // ---------- counters ----------
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

  // project closures (legacy “winner” + wouldUseAgain)
  function closuresWonCount(recId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM project_closures WHERE winnerRecommendationId=?`
      )
      .get(recId);
    return Number(row?.c || 0);
  }
  function closuresWouldAgainCount(recId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c
           FROM project_closures
          WHERE winnerRecommendationId=? AND COALESCE(wouldUseAgain,0)=1`
      )
      .get(recId);
    return Number(row?.c || 0);
  }

  // project completions (newer flow)
  function completionRows(recId) {
    // returns all completions for this recommendation
    return db
      .prepare(
        `SELECT id, projectId, didWorkGoAhead, wouldHireAgain
           FROM project_completions
          WHERE recommendationId=?`
      )
      .all(recId);
  }
  function completionPhotoCountFor(recId) {
    const rows = completionRows(recId);
    if (!rows || rows.length === 0) return 0;
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c
           FROM project_completion_photos
          WHERE completionId IN (${placeholders})`
      )
      .get(...ids);
    return Number(row?.c || 0);
  }
  function completionWinsCount(recId) {
    // treat “didWorkGoAhead=1” completions as wins
    const rows = completionRows(recId);
    return rows.reduce(
      (n, r) => n + (Number(r?.didWorkGoAhead || 0) === 1 ? 1 : 0),
      0
    );
  }
  function completionWouldAgainCount(recId) {
    const rows = completionRows(recId);
    return rows.reduce(
      (n, r) => n + (Number(r?.wouldHireAgain || 0) === 1 ? 1 : 0),
      0
    );
  }

  // Companies House — take the latest verification for the recommendation
  function companyVerification(recId) {
    const row = db
      .prepare(
        `SELECT status, score, companyNumber, companyName, checkedAt
           FROM company_verifications
          WHERE recommendationId=?
          ORDER BY COALESCE(checkedAt,'') DESC, id DESC
          LIMIT 1`
      )
      .get(recId);
    if (!row) return null;
    return {
      status: String(row.status || ""),
      score: row.score == null ? null : Number(row.score),
      companyNumber: row.companyNumber || null,
      companyName: row.companyName || null,
      checkedAt: row.checkedAt || null,
    };
  }

  // ---------- scoring ----------
  function computeScore({
    isRecommended, // 0/1
    fromFriend, // 0/1
    fromCommunity, // 0/1
    likes, // int
    wins, // completed jobs count (closures + completions)
    recPhotos, // photos attached to recommendation
    completionPhotos, // photos attached to completion(s)
    wouldAgain, // positive “would hire/use again” count
    ch, // {status, score?}
  }) {
    let s = 0;

    // 1) Exists (baseline)
    s += isRecommended ? 1.0 : 0;

    // 2) Provenance
    if (fromFriend) s += 0.2;
    if (fromCommunity) s += 0.4;

    // 3) Completed jobs (diminishing)
    s += Math.min(4, Math.log2(1 + wins)) * 0.8; // up to +3.2

    // 4) Vote ups (diminishing)
    s += Math.min(4, Math.log2(1 + likes)) * 0.5; // up to +2.0

    // 5) Recommendation photos (diminishing)
    if (recPhotos > 0) s += Math.min(3, Math.log2(1 + recPhotos)) * 0.35;

    // 6) Completion photos (usually fewer; still reward them)
    if (completionPhotos > 0)
      s += Math.min(3, Math.log2(1 + completionPhotos)) * 0.25;

    // 7) Would hire/use again — strong signal
    s += wouldAgain * 0.7;

    // 8) Companies House (status boost + optional numeric score scaling)
    if (ch) {
      const st = String(ch.status || "").toLowerCase();
      if (st === "verified") s += 0.6;
      else if (st === "ambiguous") s += 0.15;
      else if (st === "no_match") s += 0; // no bump
      if (Number.isFinite(ch.score))
        s += Math.min(0.5, (Number(ch.score) / 100) * 0.5);
    }

    // keep one decimal place (like “VMB 2.9”)
    return Math.round(s * 20) / 20;
  }

  // ------------- project-wide ranking -------------
  router.get("/recommendations/ratings", auth, (req, res, next) => {
    const projectId = toNum(req.query.projectId);
    if (!projectId) return next(); // let the single-rec handler run

    // Visibility
    const proj = db
      .prepare(`SELECT ownerUserId, status, location FROM projects WHERE id=?`)
      .get(projectId);
    if (!proj) return res.status(404).json({ error: "Not found" });

    const viewerUid = req.user?.uid || null;
    const isOwner = !!viewerUid && String(viewerUid) === String(proj.ownerUserId);
    const statusLc = String(proj.status || "").toLowerCase();
    const isLive = statusLc === "live";
    const isCompleted = statusLc === "completed";
    if (!isOwner && !isLive && !isCompleted) {
      return res.status(404).json({ error: "Not found" });
    }

    // Location tokens (defensive)
    const pTok =
      typeof extractLocationTokens === "function"
        ? extractLocationTokens(proj.location || "")
        : {};

    // Paging: support page/pageSize OR offset/limit
    const hasOffsetLimit = req.query.offset != null || req.query.limit != null;
    const limitRaw = toNum(req.query.limit);
    const offsetRaw = toNum(req.query.offset);
    const pageRaw = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSizeRaw = Math.max(
      1,
      Math.min(250, parseInt(String(req.query.pageSize ?? "50"), 10))
    );
    const pageSize = hasOffsetLimit
      ? Math.max(1, Math.min(250, limitRaw ?? 50))
      : pageSizeRaw;
    const offset = hasOffsetLimit
      ? Math.max(0, offsetRaw ?? 0)
      : (pageRaw - 1) * pageSize;

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM recommendations WHERE projectId=?`)
      .get(projectId);

    const uidForLike = String(viewerUid || "");
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
      .all(uidForLike, projectId, pageSize, offset);

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
      const recPhotos = recPhotoCount(r.id);

      // Completions / photos from completions
      const compWins = completionWinsCount(r.id);
      const compPhotos = completionPhotoCountFor(r.id);

      // Legacy closures (do not lose past data)
      const legacyWins = closuresWonCount(r.id);
      const wouldAgainLegacy = closuresWouldAgainCount(r.id);

      const wouldAgainNew = completionWouldAgainCount(r.id);

      const ch = companyVerification(r.id);

      const score = computeScore({
        isRecommended: 1,
        fromFriend:
          String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0,
        fromCommunity: communityMatch(r),
        likes,
        wins: compWins + legacyWins,
        recPhotos,
        completionPhotos: compPhotos,
        wouldAgain: wouldAgainLegacy + wouldAgainNew,
        ch,
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
      total: Number(totalRow?.c || 0),
      page: hasOffsetLimit ? Math.floor(offset / pageSize) + 1 : pageRaw,
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
        `SELECT r.id, r.recommenderUserId, r.source,
                p.ownerUserId, p.status, p.location
           FROM recommendations r
           JOIN projects p ON p.id = r.projectId
          WHERE r.id = ?`
      )
      .get(recId);

    if (!row) return res.status(404).json({ error: "Not found" });

    const viewerUid = req.user?.uid || null;
    const isOwner = !!viewerUid && String(viewerUid) === String(row.ownerUserId);
    const isRecommender =
      !!viewerUid && String(viewerUid) === String(row.recommenderUserId);
    const isLive = String(row.status || "").toLowerCase() === "live";

    if (!isLive && !isOwner && !isRecommender) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // recompute with the same ingredients
    const likes = likesFor(recId);
    const recPhotos = recPhotoCount(recId);
    const compWins = completionWinsCount(recId);
    const compPhotos = completionPhotoCountFor(recId);
    const legacyWins = closuresWonCount(recId);
    const wouldAgainLegacy = closuresWouldAgainCount(recId);
    const wouldAgainNew = completionWouldAgainCount(recId);
    const ch = companyVerification(recId);

    // community flag not important for single, but keep logic consistent
    let fromCommunity = 0;
    if (row.recommenderUserId && extractLocationTokens) {
      const pTok = extractLocationTokens(row.location || "");
      const u = db
        .prepare(
          `SELECT postcode, postcodeSector, postcodeOutward, city
             FROM users WHERE uid=?`
        )
        .get(row.recommenderUserId);
      fromCommunity = Number(
        (pTok?.full && u?.postcode === pTok.full) ||
          (pTok?.sector && u?.postcodeSector === pTok.sector) ||
          (pTok?.outward && u?.postcodeOutward === pTok.outward) ||
          (pTok?.city &&
            u?.city &&
            String(u.city).toLowerCase() ===
              String(pTok.city || "").toLowerCase())
      );
    }

    const score = computeScore({
      isRecommended: 1,
      fromFriend:
        String(row.source || "platform").toLowerCase() === "magic" ? 1 : 0,
      fromCommunity,
      likes,
      wins: compWins + legacyWins,
      recPhotos,
      completionPhotos: compPhotos,
      wouldAgain: wouldAgainLegacy + wouldAgainNew,
      ch,
    });

    return res.json({ item: { recommendationId: recId, score } });
  });
};
