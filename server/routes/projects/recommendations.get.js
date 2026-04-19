// server/routes/projects/recommendations.get.js

/**
 * GET /api/projects/:id/recommendations
 * Auth: required
 * Visibility: owner OR project is live OR completed; else 404
 * Query: page, pageSize, limit
 *
 * Returns recommendations ranked primarily by createdAt (most recent first).
 * Does not return recommender PII (name, email, phone).
 *
 * Owner-only fields:
 *   - companyEmail: the recommended company's contact email, used by the
 *     hire flow to send invitations. Hidden from non-owners.
 */
const {
  logSurfacings,
} = require("../../lib/observability/matchObservations");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, extractLocationTokens } = ctx;
  const log = ctx.log || console;
  const { computeScore, normaliseScore } = require("../../lib/recommendationScoring");

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
          r.companyEmail,
          r.phone,
          r.linked_tradesman_uid,
          r.comment,
          r.rating,

          COALESCE(v.likes, 0) AS likes,
          CASE WHEN mv.userId IS NULL THEN 0 ELSE 1 END AS myLike,

          u.postcode        AS u_postcode,
          u.postcodeSector  AS u_sector,
          u.postcodeOutward AS u_outward,
          u.city            AS u_city,

          COALESCE(ph.photoCount, 0) AS photoCount,
          COALESCE(ha.accepted, 0) AS hiresAccepted,
          COALESCE(ha.declined, 0) AS hiresDeclined,
          COALESCE(cw.wins, 0) AS wins,
          COALESCE(cw.wouldAgain, 0) AS wouldAgain,
          cv.status AS chStatus,
          cv.score AS chScore,
          t_linked.public_id AS t_linked_public_id

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
          SELECT recommendationId,
                 SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
                 SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) AS declined
            FROM hires
           GROUP BY recommendationId
        ) ha ON ha.recommendationId = r.id

        LEFT JOIN (
          SELECT winnerRecommendationId,
                 COUNT(*) AS wins,
                 SUM(CASE WHEN wouldUseAgain = 1 THEN 1 ELSE 0 END) AS wouldAgain
            FROM project_closures
           WHERE winnerRecommendationId IS NOT NULL
           GROUP BY winnerRecommendationId
        ) cw ON cw.winnerRecommendationId = r.id

        LEFT JOIN (
          SELECT recommendationId, status, score
            FROM company_verifications cv1
           WHERE cv1.id = (SELECT MAX(cv2.id) FROM company_verifications cv2 WHERE cv2.recommendationId = cv1.recommendationId)
        ) cv ON cv.recommendationId = r.id

        LEFT JOIN (
          SELECT recommendationId, COUNT(*) AS photoCount
            FROM recommendation_photos
           GROUP BY recommendationId
        ) ph ON ph.recommendationId = r.id

        LEFT JOIN tradesmen t_linked ON t_linked.user_id = r.linked_tradesman_uid

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

        const item = {
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
          score: normaliseScore(computeScore({
            fromFriend: fromFriend ? 1 : 0,
            fromCommunity: fromCommunity ? 1 : 0,
            likes: Number(r.likes || 0),
            recPhotos: Number(r.photoCount || 0),
            hiresAccepted: Number(r.hiresAccepted || 0),
            hiresDeclined: Number(r.hiresDeclined || 0),
            wins: Number(r.wins || 0),
            wouldAgain: Number(r.wouldAgain || 0),
            ch: r.chStatus ? { status: r.chStatus, score: r.chScore } : null,
          })),
        };

        if (r.source) item.source = r.source;

        // Owner-only: expose the company contact email so the hire flow can
        // send invitations directly. Non-owners never see tradesman PII.
        if (isOwner) {
          item.companyEmail = r.companyEmail || null;
          if (r.source === "pipeline") {
            item.phone = r.phone || null;
            item.linked_tradesman_uid = r.linked_tradesman_uid || null;
            item.tradesmanPublicId = r.t_linked_public_id || null;
          }
        }

        return item;
      });

      log.info?.("[projects.recommendations] done", {
        projectId,
        count: items.length,
      });

      // Project Lighthouse telemetry — fire-and-forget. Logs every
      // recommendation surfaced to a homeowner so the future re-ranker
      // model has a labelled training row per (project, recommendation).
      logSurfacings({
        mysqlQuery,
        projectId,
        surfaceContext: "top_recommendations",
        items: items.map((it) => ({
          recommendationId: it.id,
          // tradesmanUserId is unknown at this layer (recommendations are
          // keyed by company name, not uid). Resolved later by the matcher.
          tradesmanUserId: null,
          score: it.score ?? null,
        })),
        log,
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
