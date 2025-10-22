// server/routes/debug/leaderboard.get.js
// Debug/owner-visible leaderboard with all score ingredients.
// GET /api/debug/leaderboard?projectId=123
//
// Auth: requires sign-in. For a projectId: owner OR project is live.
// Response: { items: [...], total }

module.exports = (router, ctx) => {
  const { db, auth, extractLocationTokens } = ctx;

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // ---------- small helpers (mirror your ratings route) ----------
  const likesFor = (rid) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM recommendation_votes WHERE recommendationId=? AND value=1`
        )
        .get(rid)?.c || 0
    );

  const recPhotoCount = (rid) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM recommendation_photos WHERE recommendationId=?`
        )
        .get(rid)?.c || 0
    );

  const closuresWonCount = (rid) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM project_closures WHERE winnerRecommendationId=?`
        )
        .get(rid)?.c || 0
    );

  const closuresWouldAgainCount = (rid) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM project_closures
            WHERE winnerRecommendationId=? AND COALESCE(wouldUseAgain,0)=1`
        )
        .get(rid)?.c || 0
    );

  const completionRows = (rid) =>
    db
      .prepare(
        `SELECT id, didWorkGoAhead, wouldHireAgain
           FROM project_completions
          WHERE recommendationId=?`
      )
      .all(rid);

  const completionWinsCount = (rid) =>
    completionRows(rid).reduce(
      (n, r) => n + (Number(r?.didWorkGoAhead || 0) === 1 ? 1 : 0),
      0
    );

  const completionWouldAgainCount = (rid) =>
    completionRows(rid).reduce(
      (n, r) => n + (Number(r?.wouldHireAgain || 0) === 1 ? 1 : 0),
      0
    );

  const completionPhotoCountFor = (rid) => {
    const rows = completionRows(rid);
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    return Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM project_completion_photos WHERE completionId IN (${placeholders})`
        )
        .get(...ids)?.c || 0
    );
  };

  const companyVerification = (rid) => {
    const row = db
      .prepare(
        `SELECT status, score, companyNumber, companyName, checkedAt
           FROM company_verifications
          WHERE recommendationId=?
          ORDER BY COALESCE(checkedAt,'') DESC, id DESC
          LIMIT 1`
      )
      .get(rid);
    if (!row) return null;
    return {
      status: String(row.status || ""),
      score: row.score == null ? null : Number(row.score),
      companyNumber: row.companyNumber || null,
      companyName: row.companyName || null,
      checkedAt: row.checkedAt || null,
    };
  };

  // --- exact same scoring as the ratings route ---
  function computeScore({
    isRecommended,
    fromFriend,
    fromCommunity,
    likes,
    wins,
    recPhotos,
    completionPhotos,
    wouldAgain,
    ch,
  }) {
    let s = 0;
    s += isRecommended ? 1.0 : 0;
    if (fromFriend) s += 0.2;
    if (fromCommunity) s += 0.4;
    s += Math.min(4, Math.log2(1 + wins)) * 0.8;
    s += Math.min(4, Math.log2(1 + likes)) * 0.5;
    if (recPhotos > 0) s += Math.min(3, Math.log2(1 + recPhotos)) * 0.35;
    if (completionPhotos > 0)
      s += Math.min(3, Math.log2(1 + completionPhotos)) * 0.25;
    s += wouldAgain * 0.7;
    if (ch) {
      const st = String(ch.status || "").toLowerCase();
      if (st === "verified") s += 0.6;
      else if (st === "ambiguous") s += 0.15;
      if (Number.isFinite(ch.score))
        s += Math.min(0.5, (Number(ch.score) / 100) * 0.5);
    }
    return Math.round(s * 20) / 20;
  }

  // ---------- route ----------
  router.get("/debug/leaderboard", auth, (req, res) => {
    const projectId = toNum(req.query.projectId);
    if (!projectId)
      return res.status(400).json({ error: "projectId required" });

    const proj = db
      .prepare(`SELECT ownerUserId, status, location FROM projects WHERE id=?`)
      .get(projectId);
    if (!proj) return res.status(404).json({ error: "Project not found" });

    const uid = req.user?.uid || null;
    const isOwner = uid && String(uid) === String(proj.ownerUserId);
    const isLive = String(proj.status || "").toLowerCase() === "live";
    if (!isOwner && !isLive)
      return res.status(403).json({ error: "Forbidden" });

    const pTok = extractLocationTokens?.(proj.location || "") || {};

    const rows = db
      .prepare(
        `SELECT
           r.id, r.projectId, r.company, r.name, r.email, r.phone, r.comment,
           r.isAnonymous, r.createdAt, r.source, r.recommenderUserId
         FROM recommendations r
         WHERE r.projectId=?`
      )
      .all(projectId);

    function fromCommunityFlag(row) {
      if (!row.recommenderUserId) return 0;
      const u = db
        .prepare(
          `SELECT postcode, postcodeSector, postcodeOutward, city FROM users WHERE uid=?`
        )
        .get(row.recommenderUserId);
      return Number(
        (pTok.full && u?.postcode === pTok.full) ||
          (pTok.sector && u?.postcodeSector === pTok.sector) ||
          (pTok.outward && u?.postcodeOutward === pTok.outward) ||
          (pTok.city &&
            u?.city &&
            String(u.city).toLowerCase() ===
              String(pTok.city || "").toLowerCase())
      );
    }

    const items = rows.map((r) => {
      const likes = likesFor(r.id);
      const recPhotos = recPhotoCount(r.id);
      const compWins = completionWinsCount(r.id);
      const compPhotos = completionPhotoCountFor(r.id);
      const legacyWins = closuresWonCount(r.id);
      const wouldAgain =
        closuresWouldAgainCount(r.id) + completionWouldAgainCount(r.id);
      const ch = companyVerification(r.id);

      const score = computeScore({
        isRecommended: 1,
        fromFriend:
          String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0,
        fromCommunity: fromCommunityFlag(r),
        likes,
        wins: compWins + legacyWins,
        recPhotos,
        completionPhotos: compPhotos,
        wouldAgain,
        ch,
      });

      return {
        id: r.id,
        projectId: r.projectId,
        company: r.company,
        name: r.name,
        createdAt: r.createdAt,
        fromFriend:
          String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0,
        fromCommunity: fromCommunityFlag(r),
        likes,
        recPhotos,
        completionWins: compWins,
        completionPhotos: compPhotos,
        legacyWins,
        wouldAgain,
        chStatus: ch?.status || null,
        chScore: ch?.score ?? null,
        score,
      };
    });

    items.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.likes !== a.likes) return b.likes - a.likes;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    res.json({ items, total: items.length });
  });
};
