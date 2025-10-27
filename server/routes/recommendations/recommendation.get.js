// server/routes/recommendations/recommendation.get.js
/**
 * GET /api/recommendations/:id
 * Auth: optional
 * Visibility:
 *   - If project is live: anyone
 *   - Else: owner or recommender
 *   - Else: if viewer is in the same local area as the project (postcode full/sector/outward or city)
 * Response: { recommendation }
 */
module.exports = (router, ctx) => {
  const { db, admin, extractLocationTokens } = ctx;

  // Allow unauthenticated callers; if Bearer is present, attach req.user
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

  // helper to decide if viewer shares the same locality as the project
  function isCommunityViewer(projectLocation, viewerUid) {
    if (!viewerUid || !extractLocationTokens) return false;

    const pTok = extractLocationTokens(projectLocation || "");
    if (!pTok) return false;

    const u = db
      .prepare(
        `SELECT postcode, postcodeSector, postcodeOutward, city
           FROM users WHERE uid = ?`
      )
      .get(String(viewerUid));

    if (!u) return false;
    return Boolean(
      (pTok.full && u.postcode === pTok.full) ||
        (pTok.sector && u.postcodeSector === pTok.sector) ||
        (pTok.outward && u.postcodeOutward === pTok.outward) ||
        (pTok.city &&
          u.city &&
          String(u.city).toLowerCase() === String(pTok.city).toLowerCase())
    );
  }

  router.get("/recommendations/:id", optionalAuth(admin), (req, res) => {
    const recId = Number(req.params.id);
    if (!Number.isFinite(recId)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const row = db
      .prepare(
        `
        SELECT r.*,
               p.id    AS projectId,
               p.name  AS projectName,
               p.ownerUserId,
               p.status AS projectStatus,
               p.location AS projectLocation,
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
    const isOwner = !!uid && String(uid) === String(row.ownerUserId);
    const isRecommender =
      !!uid && String(uid) === String(row.recommenderUserId);
    const isLive = String(row.projectStatus || "").toLowerCase() === "live";

    // Visibility gate:
    if (!isLive && !isOwner && !isRecommender) {
      // allow if viewer is in the same locality as the project (community visibility)
      const communityOK = isCommunityViewer(row.projectLocation, uid);
      if (!communityOK) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // myLike for current viewer
    const myLike =
      uid &&
      db
        .prepare(
          `SELECT 1 FROM recommendation_votes
            WHERE recommendationId = ? AND userId = ? AND value = 1`
        )
        .get(recId, String(uid))
        ? 1
        : 0;

    // photos -> absolute URLs
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

    // fromCommunity badge (was previously derived from project vs recommender locality)
    let fromCommunity = 0;
    try {
      const pTok = extractLocationTokens
        ? extractLocationTokens(row.projectLocation || "")
        : null;
      if (pTok && row.recommenderUserId) {
        const u = db
          .prepare(
            `SELECT postcode, postcodeSector, postcodeOutward, city
               FROM users WHERE uid=?`
          )
          .get(String(row.recommenderUserId));
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
    } catch {
      fromCommunity = 0;
    }

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
      project: { id: row.projectId, name: row.projectName },
    };

    return res.json({ recommendation });
  });
};
