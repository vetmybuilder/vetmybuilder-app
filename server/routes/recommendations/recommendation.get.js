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
      // LEFT JOIN tradesmen via linked_tradesman_uid so we can surface the
      // company's external review profiles (Trustpilot/Bark/Checkatrade/etc.)
      // on the builder profile page. The column is nullable on tradesmen, so
      // the JSON_EXTRACT returns NULL when no links are configured.
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
              ), 0) AS likes,
              t.review_links_json AS reviewLinksJson,
              t.profile_picture_url AS tradesmanPhotoUrl,
              t.phone AS tradesmanPhone,
              t.email AS tradesmanEmail,
              u.firstName AS recommenderFirstName
            FROM recommendations r
            JOIN projects p
              ON p.id = r.projectId
            LEFT JOIN tradesmen t
              ON t.user_id = r.linked_tradesman_uid
            LEFT JOIN users u
              ON u.uid = r.recommenderUserId
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
        return { id: String(p.id), url: p.fp, thumb: p.fp };
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

      // ===== Builder summary =====
      let summary = null;
      if (row.company) {
        try {
          const summaryRows = await mysqlQuery(
            `SELECT bullets, recommendation_count, computed_at
               FROM builder_summaries
              WHERE company = ?
              LIMIT 1`,
            [row.company],
          );
          if (summaryRows.length > 0) {
            summary = {
              bullets: JSON.parse(summaryRows[0].bullets),
              recommendationCount: summaryRows[0].recommendation_count,
              computedAt: summaryRows[0].computed_at,
            };
          }
        } catch (err) {
          log.warn?.(`${TAG} summary lookup failed`, {
            company: row.company,
            error: err?.message,
          });
        }
      }

      // ===== Favourite state (from linked tradesman) =====
      // The recommendation itself isn't favouriteable; we mirror the
      // tradesman favourite state when the rec is linked to a known
      // tradesman. The mobile heart icon uses the same toggle endpoint.
      let isFavourite = false;
      const linkedTradesmanUid = row.linked_tradesman_uid || null;
      if (uid && linkedTradesmanUid) {
        try {
          const favRows = await mysqlQuery(
            `SELECT 1 FROM favourite_tradesmen
              WHERE userId = ? AND builderId = ? LIMIT 1`,
            [uid, linkedTradesmanUid]
          );
          isFavourite = favRows.length > 0;
        } catch (err) {
          // table may not exist on older test schemas — treat as not favourited
        }
      }

      // ===== External review links (from linked tradesman) =====
      // Stored on tradesmen.review_links_json as a JSON array of
      // { platform, url } objects. Parsed here so the client renders a
      // simple list. Falls back to [] if absent or malformed.
      let reviewLinks = [];
      const rawLinks = row.reviewLinksJson;
      if (rawLinks) {
        try {
          const parsed =
            typeof rawLinks === "string" ? JSON.parse(rawLinks) : rawLinks;
          if (Array.isArray(parsed)) {
            reviewLinks = parsed
              .map((entry) => ({
                platform: String(entry?.platform || "").trim(),
                url: String(entry?.url || "").trim(),
              }))
              .filter((e) => e.platform && e.url);
          }
        } catch (err) {
          log.warn?.(`${TAG} review_links_json parse failed`, {
            recId,
            error: err?.message,
          });
        }
      }

      // ===== Build final response =====
      const toIntOrNull = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
      };
      // SECURITY: recommender PII (real name / phone / email) is owner-only.
      // Community / live viewers see only the masked `recommender.name` field
      // computed below (firstName, first word, or "Guest"/"Anonymous").
      // Tradesperson contact info on the linked tradesman + the `contact`
      // block is also owner-only - non-owners must go via the matches
      // endpoint or a paid unlock to surface contact details.
      const recommendation = {
        id: row.id,
        company: row.company,
        comment: row.comment,
        createdAt: row.createdAt,
        name: isOwner ? row.name : null,
        email: isOwner ? row.email : null,
        phone: isOwner ? (row.phone == null ? null : String(row.phone)) : null,
        isAnonymous: row.isAnonymous,
        likes: Number(row.likes || 0),
        myLike,
        rating: row.rating ?? null,
        // Per-category star ratings collected on the mobile recommend wizard.
        // Each is null when not provided so the UI can hide empty rows.
        ratings: {
          quality: toIntOrNull(row.quality_rating),
          reliability: toIntOrNull(row.reliability_rating),
          communication: toIntOrNull(row.communication_rating),
          trust: toIntOrNull(row.trust_rating),
          value: toIntOrNull(row.value_rating),
        },
        fromFriend: String(row.source || "").toLowerCase() === "magic" ? 1 : 0,
        fromCommunity,
        photos,
        reviewLinks,
        linkedTradesmanUid,
        isFavourite,

        // Recommender display name: firstName > first word of typed name > "Guest"
        recommender: {
          name: row.isAnonymous
            ? "Anonymous"
            : (row.recommenderFirstName ||
               (row.name ? String(row.name).trim().split(/\s+/)[0] : null) ||
               "Guest"),
        },

        // Linked tradesman details (null if no link). Contact fields are
        // owner-only - non-owners must go via /api/matches/:matchId or a
        // paid unlock to see phone/email.
        tradesman: linkedTradesmanUid
          ? {
              uid: linkedTradesmanUid,
              photoUrl: row.tradesmanPhotoUrl || null,
              phone: isOwner
                ? (row.tradesmanPhone ? String(row.tradesmanPhone) : null)
                : null,
              email: isOwner ? (row.tradesmanEmail || null) : null,
            }
          : null,

        // Contact fallback: tradesman first, then rec's own fields. Owner-only.
        contact: {
          phone: isOwner
            ? ((row.tradesmanPhone ? String(row.tradesmanPhone) : null) ||
               (row.phone ? String(row.phone) : null))
            : null,
          email: isOwner
            ? (row.tradesmanEmail || row.email || row.companyEmail || null)
            : null,
        },

        // 🔥 NOW MASKED
        project: {
          id: row.projectId,
          name: row.projectName,
          location: safeProjectLocation,
        },

        summary,  // null if no summary exists
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
