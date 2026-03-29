// server/routes/projects/recommendations.get.js

/**
 * GET /api/projects/:id/recommendations
 * Auth: required
 * Visibility: owner OR project is live OR completed; else 404
 * Query: page, pageSize, limit
 *
 * Returns recommendations ranked primarily by createdAt (most recent first).
 * Does not return recommender PII.
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery, extractLocationTokens } = ctx;
  const log = ctx.log || console;

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  const toInt = (v, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : def;
  };

  router.get("/projects/:id/recommendations", auth, async (req, res) => {
    const projectId = Number(req.params.id);
    log.info?.("[projects.recommendations] start", { projectId });

    try {
      if (!Number.isFinite(projectId)) {
        log.warn?.("[projects.recommendations] invalid id", { projectId });
        return res.status(400).json({ error: "Invalid id" });
      }

      // ---- Visibility gate ----
      const projRows = await mysqlQuery(
        `SELECT ownerUserId, status, location
           FROM projects
          WHERE id = ?
          LIMIT 1`,
        [projectId]
      );
      const proj = projRows[0];
      if (!proj) {
        log.warn?.("[projects.recommendations] not found", { projectId });
        return res.status(404).json({ error: "Not found" });
      }

      const uid = req.user?.uid || null;
      const isOwner = !!uid && String(uid) === String(proj.ownerUserId ?? "");

      const statusLc = String(proj.status || "").toLowerCase();
      const isLive = statusLc === "live";
      const isCompleted = statusLc === "completed";

      if (!isOwner && !isLive && !isCompleted) {
        log.warn?.("[projects.recommendations] visibility restricted", {
          projectId,
          uid,
          status: statusLc,
        });
        return res.status(404).json({ error: "Not found" });
      }

      // ---- Paging ----
      const page = Math.max(1, toInt(req.query.page ?? "1", 1));
      const pageSizeQuery = toInt(req.query.pageSize, 10);
      const limitQuery = toInt(req.query.limit, null);

      const pageSize = Math.max(
        1,
        Math.min(50, limitQuery || pageSizeQuery || 10)
      );
      const offset = (page - 1) * pageSize;

      const safeLimit = Math.max(1, Math.min(50, pageSize || 10));
      const safeOffset = Math.max(0, offset || 0);

      // ---- Total count ----
      const totalRows = await mysqlQuery(
        `SELECT COUNT(*) AS c
           FROM recommendations
          WHERE projectId = ?`,
        [projectId]
      );
      const total = Number(totalRows?.[0]?.c || 0);

      if (total === 0) {
        log.info?.("[projects.recommendations] no recommendations", {
          projectId,
        });
        return res.json({
          items: [],
          total: 0,
          page,
          pageSize: safeLimit,
        });
      }

      const pTok =
        typeof extractLocationTokens === "function"
          ? extractLocationTokens(proj.location || "")
          : null;

      const viewerId = String(uid || "");

      // IMPORTANT: LIMIT/OFFSET interpolated because of mysql libs
      const sql = `
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

          COALESCE(v.likes, 0) AS likes,
          CASE WHEN mv.userId IS NULL THEN 0 ELSE 1 END AS myLike,

          u.postcode        AS u_postcode,
          u.postcodeSector  AS u_sector,
          u.postcodeOutward AS u_outward,
          u.city            AS u_city,

          COALESCE(ph.photoCount, 0) AS photoCount

        FROM recommendations r

        LEFT JOIN (
          SELECT recommendationId, COUNT(*) AS likes
            FROM recommendation_votes
           WHERE value = 1
           GROUP BY recommendationId
        ) v ON v.recommendationId = r.id

        LEFT JOIN recommendation_votes mv
               ON mv.recommendationId = r.id
              AND mv.userId = ?

        LEFT JOIN users u
               ON u.uid = r.recommenderUserId

        LEFT JOIN (
          SELECT recommendationId, COUNT(*) AS photoCount
            FROM recommendation_photos
           GROUP BY recommendationId
        ) ph ON ph.recommendationId = r.id

        WHERE r.projectId = ?
        ORDER BY r.createdAt DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}
      `;

      const rows = await mysqlQuery(sql, [viewerId, projectId]);

      function computeFromCommunity(row) {
        if (
          !row.recommenderUserId ||
          !pTok ||
          (!pTok.full && !pTok.sector && !pTok.outward && !pTok.city)
        ) {
          return 0;
        }

        const inSameArea =
          (pTok.full && row.u_postcode === pTok.full) ||
          (pTok.sector && row.u_sector === pTok.sector) ||
          (pTok.outward && row.u_outward === pTok.outward) ||
          (pTok.city &&
            row.u_city &&
            String(row.u_city).toLowerCase() ===
              String(pTok.city || "").toLowerCase());

        return Number(Boolean(inSameArea));
      }

      const items = rows.map((r) => {
        const isMagic = String(r.source || "").toLowerCase() === "magic";
        const hasUser = r.recommenderUserId != null;
        const isAnonFlag = !!r.isAnonymous;

        const fromFriend = isMagic && (!hasUser || isAnonFlag);
        const fromCommunity = !fromFriend ? computeFromCommunity(r) : 0;

        return {
          id: r.id,
          company: r.company,
          comment: r.comment,
          createdAt: r.createdAt,
          rating: r.rating ?? null,
          likes: Number(r.likes || 0),
          myLike: r.myLike ? 1 : 0,
          fromFriend,
          fromCommunity,
          photoCount: Number(r.photoCount || 0),
          score: 0,
        };
      });

      log.info?.("[projects.recommendations] done", {
        projectId,
        count: items.length,
      });

      return res.json({
        items,
        total,
        page,
        pageSize: safeLimit,
      });
    } catch (err) {
      log.error?.("[projects.recommendations] error", err);
      return res.status(500).json({
        error: "internal_error_loading_recommendations",
      });
    }
  });
};
