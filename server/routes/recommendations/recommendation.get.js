// server/routes/recommendations/recommendation.get.js
/**
 * GET /api/recommendations/:id
 * Auth: optional
 * Visibility:
 *   - If project is live: anyone
 *   - Else: owner or recommender
 *   - Else: if viewer is in the same local area as the project
 * Response: { recommendation }
 */
module.exports = (router, ctx) => {
  const { mysqlQuery, admin } = ctx;

  // 🔥 NOW IMPORTS BOTH extractLocationTokens AND formatPostcode
  const {
    extractLocationTokens,
    formatPostcode,
  } = require("../../lib/location");

  const log = ctx.log || console;
  const TAG = "[recommendations.get]";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  /** Optional auth token parser */
  function optionalAuth(adminInstance) {
    return async (req, _res, next) => {
      try {
        const h = req.headers?.authorization || "";
        if (h.startsWith("Bearer ")) {
          const decoded = await adminInstance.auth().verifyIdToken(h.slice(7));
          req.user = { uid: decoded.uid, email: decoded.email || null };
        }
      } catch {
        // ignore invalid token
      }
      next();
    };
  }

  const PUBLIC_API_BASE =
    ctx.PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    `http://localhost:${process.env.PORT || 8787}`;

  /** Determine whether viewer is in the same local area as the project */
  async function isCommunityViewer(projectLocation, viewerUid) {
    if (!viewerUid || !extractLocationTokens) return false;

    const pTok = extractLocationTokens(projectLocation || "");
    if (!pTok) return false;

    try {
      const rows = await mysqlQuery(
        `
        SELECT postcode, postcodeSector, postcodeOutward, city
          FROM users
         WHERE uid = ?
         LIMIT 1
      `,
        [String(viewerUid)]
      );

      const u = rows?.[0];
      if (!u) return false;

      return Boolean(
        (pTok.full && u.postcode === pTok.full) ||
          (pTok.sector && u.postcodeSector === pTok.sector) ||
          (pTok.outward && u.postcodeOutward === pTok.outward) ||
          (pTok.city &&
            u.city &&
            String(u.city).toLowerCase() === String(pTok.city).toLowerCase())
      );
    } catch (err) {
      log.warn?.(`${TAG} locality-check failed`, {
        viewerUid,
        error: err?.message,
      });
      return false;
    }
  }

  router.get("/recommendations/:id", optionalAuth(admin), async (req, res) => {
    log.info?.(`${TAG} start`, { id: req.params.id });

    try {
      const recId = Number(req.params.id);
      if (!Number.isFinite(recId)) {
        log.warn?.(`${TAG} invalid id`, { recId });
        return res.status(400).json({ error: "Invalid id" });
      }

      // ===== Load recommendation & project =====
      let recRows;
      try {
        recRows = await mysqlQuery(
          `
            SELECT
              r.*,
              p.id      AS projectId,
              p.name    AS projectName,
              p.ownerUserId,
              p.status  AS projectStatus,
              p.location AS projectLocation,
              COALESCE((
                SELECT COUNT(*)
                  FROM recommendation_votes v
                 WHERE v.recommendationId = r.id
                   AND v.value = 1
              ), 0) AS likes
            FROM recommendations r
            JOIN projects p
              ON p.id = r.projectId
            WHERE r.id = ?
            LIMIT 1
          `,
          [recId]
        );
      } catch (err) {
        log.error?.(`${TAG} fetch failed`, { error: err?.message });
        return res.status(500).json({ error: "internal_error" });
      }

      const row = recRows?.[0];
      if (!row) {
        log.warn?.(`${TAG} not found`, { recId });
        return res.status(404).json({ error: "Not found" });
      }

      const uid = req.user?.uid || null;
      const isOwner = !!uid && String(uid) === String(row.ownerUserId);
      const isRecommender =
        !!uid && String(uid) === String(row.recommenderUserId);
      const isLive = String(row.projectStatus || "").toLowerCase() === "live";

      // ===== Visibility gate =====
      if (!isLive && !isOwner && !isRecommender) {
        const communityOK = await isCommunityViewer(row.projectLocation, uid);

        if (!communityOK) {
          log.warn?.(`${TAG} visibility denied`, {
            recId,
            viewer: uid,
            reason: "not live / not owner / not recommender / not community",
          });
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      // ===== myLike =====
      let myLike = 0;
      if (uid) {
        try {
          const likeRows = await mysqlQuery(
            `
              SELECT 1
                FROM recommendation_votes
               WHERE recommendationId = ?
                 AND userId = ?
                 AND value = 1
               LIMIT 1
            `,
            [recId, String(uid)]
          );
          myLike = likeRows?.length ? 1 : 0;
        } catch (err) {
          log.warn?.(`${TAG} myLike lookup failed`, {
            recId,
            user: uid,
            error: err?.message,
          });
          myLike = 0;
        }
      }

      // ===== Photos =====
      let photoRows = [];
      try {
        photoRows = await mysqlQuery(
          `
            SELECT id, filePath AS fp, mime
              FROM recommendation_photos
             WHERE recommendationId = ?
             ORDER BY id ASC
          `,
          [recId]
        );
      } catch (err) {
        log.warn?.(`${TAG} photo fetch failed`, {
          recId,
          error: err?.message,
        });
      }

      const photos = (photoRows || []).map((p) => {
        const abs = new URL(p.fp, PUBLIC_API_BASE).toString();
        return { id: String(p.id), url: abs, thumb: abs };
      });

      // ===== fromCommunity (same logic) =====
      let fromCommunity = 0;
      try {
        if (
          extractLocationTokens &&
          row.projectLocation &&
          row.recommenderUserId
        ) {
          const pTok = extractLocationTokens(row.projectLocation || "");
          const uRows = await mysqlQuery(
            `
              SELECT postcode, postcodeSector, postcodeOutward, city
                FROM users
               WHERE uid = ?
               LIMIT 1
            `,
            [String(row.recommenderUserId)]
          );

          const u = uRows?.[0];
          fromCommunity = Number(
            u &&
              ((pTok.full && u.postcode === pTok.full) ||
                (pTok.sector && u.postcodeSector === pTok.sector) ||
                (pTok.outward && u.postcodeOutward === pTok.outward) ||
                (pTok.city &&
                  u.city &&
                  String(u.city).toLowerCase() ===
                    String(pTok.city || "").toLowerCase()))
          );
        }
      } catch (err) {
        log.warn?.(`${TAG} community check failed`, {
          recId,
          error: err?.message,
        });
      }

      // ===== SAFE PROJECT LOCATION (MASKED) =====
      const safeProjectLocation = formatPostcode(row.projectLocation);

      // ===== Build final response =====
      const recommendation = {
        id: row.id,
        company: row.company,
        comment: row.comment,
        createdAt: row.createdAt,
        name: row.name,
        email: row.email,
        phone: row.phone == null ? null : String(row.phone),
        isAnonymous: row.isAnonymous,
        likes: Number(row.likes || 0),
        myLike,
        rating: row.rating ?? null,
        fromFriend: String(row.source || "").toLowerCase() === "magic" ? 1 : 0,
        fromCommunity,
        photos,

        // 🔥 NOW MASKED
        project: {
          id: row.projectId,
          name: row.projectName,
          location: safeProjectLocation,
        },
      };

      log.info?.(`${TAG} success`, { recId });
      return res.json({ recommendation });
    } catch (e) {
      log.error?.(`${TAG} fatal`, { error: e?.message });
      return res.status(500).json({
        error: "FAILED",
        message: e?.message || String(e),
      });
    }
  });
};
