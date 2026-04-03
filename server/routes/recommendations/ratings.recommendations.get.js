// server/routes/recommendations/ratings.recommendations.get.js
module.exports = (router, ctx) => {
  const { auth, admin, extractLocationTokens, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[recommendations.ratings.get]";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx");
  }

  // optionalAuth identical to other routes
  function optionalAuth(adminInstance) {
    return async (req, _res, next) => {
      try {
        const h = req.headers?.authorization || "";
        if (h.startsWith("Bearer ")) {
          const token = h.slice(7);
          const decoded = await adminInstance.auth().verifyIdToken(token);
          req.user = { uid: decoded.uid, email: decoded.email || null };
        }
      } catch {
        // ignore
      }
      next();
    };
  }

  // ---------- helpers ----------
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // ---- table feature-detection (MySQL) ----
  const tableCache = {};
  async function hasTable(name) {
    if (Object.prototype.hasOwnProperty.call(tableCache, name)) {
      return tableCache[name];
    }
    try {
      const safe = String(name).replace(/\\/g, "\\\\").replace(/_/g, "\\_").replace(/%/g, "\\%").replace(/'/g, "\\'");
      const rows = await mysqlQuery(`SHOW TABLES LIKE '${safe}'`);
      const ok = Array.isArray(rows) && rows.length > 0;
      tableCache[name] = ok;
      log.debug?.(`${TAG} hasTable`, { name, ok });
      return ok;
    } catch (err) {
      log.warn?.(`${TAG} table-check failed`, { name, error: err?.message });
      tableCache[name] = false;
      return false;
    }
  }

  // ---------- counters (MySQL) ----------
  async function likesFor(recId) {
    const rows = await mysqlQuery(
      `SELECT COUNT(*) AS c
         FROM recommendation_votes
        WHERE recommendationId = ? AND value = 1`,
      [recId]
    );
    return Number(rows?.[0]?.c || 0);
  }

  async function recPhotoCount(recId) {
    const rows = await mysqlQuery(
      `SELECT COUNT(*) AS c
         FROM recommendation_photos
        WHERE recommendationId = ?`,
      [recId]
    );
    return Number(rows?.[0]?.c || 0);
  }

  async function closuresWonCount(recId) {
    const rows = await mysqlQuery(
      `SELECT COUNT(*) AS c
         FROM project_closures
        WHERE winnerRecommendationId = ?`,
      [recId]
    );
    return Number(rows?.[0]?.c || 0);
  }

  async function closuresWouldAgainCount(recId) {
    const rows = await mysqlQuery(
      `SELECT COUNT(*) AS c
         FROM project_closures
        WHERE winnerRecommendationId = ?
          AND COALESCE(wouldUseAgain, 0) = 1`,
      [recId]
    );
    return Number(rows?.[0]?.c || 0);
  }

  // ---- new completion flow with guards ----
  async function completionRows(recId) {
    if (!(await hasTable("project_completions"))) return [];
    const rows = await mysqlQuery(
      `SELECT id, projectId, didWorkGoAhead, wouldHireAgain
         FROM project_completions
        WHERE recommendationId = ?`,
      [recId]
    );
    return rows || [];
  }

  async function completionPhotoCountFor(recId) {
    if (!(await hasTable("project_completion_photos"))) return 0;

    const rows = await completionRows(recId);
    if (!rows.length) return 0;

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    const countRows = await mysqlQuery(
      `SELECT COUNT(*) AS c
         FROM project_completion_photos
        WHERE completionId IN (${placeholders})`,
      ids
    );
    return Number(countRows?.[0]?.c || 0);
  }

  async function completionWinsCount(recId) {
    const rows = await completionRows(recId);
    return rows.reduce(
      (n, r) => n + (Number(r?.didWorkGoAhead || 0) === 1 ? 1 : 0),
      0
    );
  }

  async function completionWouldAgainCount(recId) {
    const rows = await completionRows(recId);
    return rows.reduce(
      (n, r) => n + (Number(r?.wouldHireAgain || 0) === 1 ? 1 : 0),
      0
    );
  }

  // --- Companies House lookup ---
  async function companyVerification(recId) {
    try {
      let rows;
      try {
        rows = await mysqlQuery(
          `SELECT status, score, companyNumber, companyName, checkedAt
             FROM company_verifications
            WHERE recommendation_id = ?
            ORDER BY COALESCE(checkedAt,'') DESC, id DESC
            LIMIT 1`,
          [recId]
        );
      } catch {
        rows = await mysqlQuery(
          `SELECT status, score, companyNumber, companyName, checkedAt
             FROM company_verifications
            WHERE recommendationId = ?
            ORDER BY COALESCE(checkedAt,'') DESC, id DESC
            LIMIT 1`,
          [recId]
        );
      }

      const row = rows?.[0];
      if (!row) return null;

      return {
        status: String(row.status || ""),
        score: row.score == null ? null : Number(row.score),
        companyNumber: row.companyNumber || null,
        companyName: row.companyName || null,
        checkedAt: row.checkedAt || null,
      };
    } catch (err) {
      log.warn?.(`${TAG} CH lookup failed`, { recId, error: err?.message });
      return null;
    }
  }

  // ---------- scoring ----------
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

  // ============================================================
  // =============== PROJECT-WIDE RATINGS ROUTE ==================
  // ============================================================
  router.get("/recommendations/ratings", auth, async (req, res, next) => {
    log.info?.(`${TAG} project-wide ratings`, {
      projectId: req.query.projectId,
    });

    const projectId = toNum(req.query.projectId);
    if (!projectId) return next(); // fall through

    // project row
    const projRows = await mysqlQuery(
      `SELECT ownerUserId, status, location
         FROM projects
        WHERE id = ?`,
      [projectId]
    );
    const proj = projRows[0];
    if (!proj) {
      log.warn?.(`${TAG} project not found`, { projectId });
      return res.status(404).json({ error: "Not found" });
    }

    // visibility
    const viewerUid = req.user?.uid || null;
    const isOwner =
      !!viewerUid && String(viewerUid) === String(proj.ownerUserId);
    const statusLc = String(proj.status || "").toLowerCase();
    const isLive = statusLc === "live";
    const isCompleted = statusLc === "completed";

    if (!isOwner && !isLive && !isCompleted) {
      log.warn?.(`${TAG} forbidden viewer`, { projectId, viewerUid });
      return res.status(404).json({ error: "Not found" });
    }

    const pTok =
      typeof extractLocationTokens === "function"
        ? extractLocationTokens(proj.location || "")
        : {};

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

    const totalRows = await mysqlQuery(
      `SELECT COUNT(*) AS c
         FROM recommendations
        WHERE projectId = ?`,
      [projectId]
    );
    const totalRow = totalRows[0];

    const uidForLike = String(viewerUid || "");

    const safeLimit = Number.isFinite(pageSize) ? pageSize : 50;
    const safeOffset = Number.isFinite(offset) ? offset : 0;

    const rows = await mysqlQuery(
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
            FROM recommendation_votes
           WHERE value = 1
           GROUP BY recommendationId
        ) v ON v.recommendationId = r.id
        LEFT JOIN recommendation_votes mv
               ON mv.recommendationId = r.id AND mv.userId = ?
        LEFT JOIN users u ON u.uid = r.recommenderUserId
        WHERE r.projectId = ?
        LIMIT ${safeLimit} OFFSET ${safeOffset}
      `,
      [uidForLike, projectId]
    );

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

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const likes = Number(r.likes || 0);

        const recPhotos = await recPhotoCount(r.id);

        const compWins = await completionWinsCount(r.id);
        const compPhotos = await completionPhotoCountFor(r.id);

        const legacyWins = await closuresWonCount(r.id);
        const wouldAgainLegacy = await closuresWouldAgainCount(r.id);
        const wouldAgainNew = await completionWouldAgainCount(r.id);

        const ch = await companyVerification(r.id);

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
          chStatus: ch?.status || null,
          chScore: ch?.score ?? null,
          chCompanyName: ch?.companyName || null,
          chCompanyNumber: ch?.companyNumber || null,
          chCheckedAt: ch?.checkedAt || null,
        };
      })
    );

    enriched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.likes || 0) !== (a.likes || 0))
        return (b.likes || 0) - (a.likes || 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    log.info?.(`${TAG} sending project ratings`, {
      projectId,
      count: enriched.length,
    });

    return res.json({
      items: enriched,
      total: Number(totalRow?.c || 0),
      page: hasOffsetLimit ? Math.floor(offset / pageSize) + 1 : pageRaw,
      pageSize,
    });
  });

  // ============================================================
  // =============== SINGLE RECOMMENDATION RATING ===============
  // ============================================================
  router.get(
    "/recommendations/ratings",
    optionalAuth(admin),
    async (req, res) => {
      const recId =
        toNum(req.query.recommendationId) ||
        toNum(req.query.recId) ||
        toNum(req.query.id);

      log.info?.(`${TAG} single rating`, { recId });

      if (!recId) return res.status(400).json({ error: "Invalid id" });

      const rows = await mysqlQuery(
        `SELECT r.id, r.recommenderUserId, r.source,
                p.ownerUserId, p.status, p.location
           FROM recommendations r
           JOIN projects p ON p.id = r.projectId
          WHERE r.id = ?`,
        [recId]
      );
      const row = rows[0];
      if (!row) {
        log.warn?.(`${TAG} recommendation not found`, { recId });
        return res.status(404).json({ error: "Not found" });
      }

      const viewerUid = req.user?.uid || null;
      const isOwner =
        !!viewerUid && String(viewerUid) === String(row.ownerUserId);
      const isRecommender =
        !!viewerUid && String(viewerUid) === String(row.recommenderUserId);
      const isLive = String(row.status || "").toLowerCase() === "live";

      // local discovery check
      let allowLocalDiscovery = false;
      if (!isLive && !isOwner && !isRecommender && viewerUid) {
        const ch = await companyVerification(recId);
        const isVerified =
          String(ch?.status || "").toLowerCase() === "verified";

        if (isVerified && typeof extractLocationTokens === "function") {
          const pTok = extractLocationTokens(row.location || "");
          const viewerRows = await mysqlQuery(
            `SELECT postcode, postcodeSector, postcodeOutward, city
               FROM users
              WHERE uid = ?`,
            [viewerUid]
          );
          const viewer = viewerRows[0];

          allowLocalDiscovery =
            !!viewer &&
            !!(
              (pTok.full && viewer.postcode === pTok.full) ||
              (pTok.sector && viewer.postcodeSector === pTok.sector) ||
              (pTok.outward && viewer.postcodeOutward === pTok.outward) ||
              (pTok.city &&
                viewer.city &&
                String(viewer.city).toLowerCase() ===
                  String(pTok.city || "").toLowerCase())
            );
        }
      }

      if (!isLive && !isOwner && !isRecommender && !allowLocalDiscovery) {
        log.warn?.(`${TAG} single rating forbidden`, {
          recId,
          viewerUid,
        });
        return res.status(403).json({ error: "Forbidden" });
      }

      const likes = await likesFor(recId);
      const recPhotos = await recPhotoCount(recId);

      const compWins = await completionWinsCount(recId);
      const compPhotos = await completionPhotoCountFor(recId);
      const legacyWins = await closuresWonCount(recId);
      const wouldAgainLegacy = await closuresWouldAgainCount(recId);
      const wouldAgainNew = await completionWouldAgainCount(recId);

      const ch = await companyVerification(recId);

      let fromCommunity = 0;
      if (
        row.recommenderUserId &&
        typeof extractLocationTokens === "function"
      ) {
        const pTok = extractLocationTokens(row.location || "");
        const uRows = await mysqlQuery(
          `SELECT postcode, postcodeSector, postcodeOutward, city
             FROM users
            WHERE uid = ?`,
          [row.recommenderUserId]
        );
        const u = uRows[0];

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

      log.info?.(`${TAG} single rating computed`, { recId, score });

      return res.json({ item: { recommendationId: recId, score } });
    }
  );
};
