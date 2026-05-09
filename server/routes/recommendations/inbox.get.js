// server/routes/recommendations/inbox.get.js
//
// GET /api/recommendations/inbox
// Homeowner-only. Returns every recommendation across all of the caller's
// projects, regardless of whether the recommended company has linked to a
// VetMyBuilder tradesman account yet.
//
// This sits next to the favourites endpoint (which only surfaces *off-
// platform* recs as discovery cards) — the inbox is the homeowner's full
// view of who has been recommended to them, ordered newest-first.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[recommendations/inbox.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  function makeAbsolute(urlOrPath) {
    if (!urlOrPath) return null;
    const s = String(urlOrPath).trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    const base = (
      process.env.MEDIA_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      ""
    ).trim();
    const cleanPath = s.startsWith("/") ? s : `/${s}`;
    if (!base) return cleanPath;
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${cleanBase}${cleanPath}`;
  }

  router.get("/recommendations/inbox", auth, async (req, res) => {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    let rows;
    try {
      rows = await mysqlQuery(
        `SELECT
           r.id           AS recommendationId,
           r.projectId    AS projectId,
           p.name         AS projectName,
           r.company,
           r.linked_tradesman_uid AS linkedTradesmanUid,
           r.isAnonymous,
           r.name         AS recommenderRawName,
           r.createdAt    AS createdAt,
           r.rating       AS rating,
           r.comment      AS comment,
           r.quality_rating       AS qualityRating,
           r.reliability_rating   AS reliabilityRating,
           r.communication_rating AS communicationRating,
           r.trust_rating         AS trustRating,
           r.value_rating         AS valueRating,
           u.firstName    AS recommenderFirstName,
           t.company_name        AS tradesmanCompanyName,
           t.profile_picture_url AS tradesmanPhotoUrl,
           t.trade_types         AS tradesmanTradeTypes
         FROM recommendations r
         JOIN projects p ON p.id = r.projectId
         LEFT JOIN users u ON u.uid = r.recommenderUserId
         LEFT JOIN tradesmen t ON t.user_id = r.linked_tradesman_uid
         WHERE p.ownerUserId = ?
           AND r.deck_dismissed_at IS NULL
           AND r.homeowner_unfavourited_at IS NULL
         ORDER BY r.createdAt DESC, r.id DESC`,
        [userId],
      );
    } catch (e) {
      log.error?.(`${TAG} SELECT failed`, { error: e?.message });
      return res.status(500).json({ error: "FAILED" });
    }

    // Fetch every photo for the rec set in a single query, then group by rec id.
    // Cover defaults to the first photo (oldest id) so it stays stable across
    // refetches; the full list is exposed on `photoUrls` for the expanded view.
    const recIds = (rows || []).map((r) => r.recommendationId);
    let photosByRecId = new Map();
    if (recIds.length > 0) {
      try {
        const placeholders = recIds.map(() => "?").join(",");
        const photoRows = await mysqlQuery(
          `SELECT recommendationId, filePath
             FROM recommendation_photos
            WHERE recommendationId IN (${placeholders})
            ORDER BY recommendationId ASC, id ASC`,
          recIds,
        );
        for (const pr of photoRows || []) {
          const list = photosByRecId.get(pr.recommendationId) || [];
          list.push(makeAbsolute(pr.filePath));
          photosByRecId.set(pr.recommendationId, list);
        }
      } catch (e) {
        log.warn?.(`${TAG} photo lookup failed`, { error: e?.message });
      }
    }

    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
    };

    const items = (rows || []).map((r) => {
      const recommenderName = r.isAnonymous
        ? "Anonymous"
        : r.recommenderFirstName ||
          (r.recommenderRawName
            ? String(r.recommenderRawName).trim().split(/\s+/)[0]
            : null) ||
          "Someone";
      const photoUrls = photosByRecId.get(r.recommendationId) || [];
      const cover =
        photoUrls[0] ||
        (r.tradesmanPhotoUrl ? makeAbsolute(r.tradesmanPhotoUrl) : null);
      return {
        kind: "recommendation",
        recommendationId: r.recommendationId,
        projectId: r.projectId,
        projectName: r.projectName || null,
        companyName: r.tradesmanCompanyName || r.company,
        displayName: r.tradesmanCompanyName || r.company,
        recommenderName,
        coverPhotoUrl: cover,
        photoUrls,
        tradeTypes: r.tradesmanTradeTypes || null,
        linkedTradesmanUid: r.linkedTradesmanUid || null,
        createdAt: r.createdAt,
        rating: num(r.rating),
        comment: r.comment ? String(r.comment) : null,
        ratings: {
          quality: num(r.qualityRating),
          reliability: num(r.reliabilityRating),
          communication: num(r.communicationRating),
          trust: num(r.trustRating),
          value: num(r.valueRating),
        },
      };
    });

    return res.json({ items });
  });

  if (!ctx.__logged_recommendations_inbox_get) {
    ctx.__logged_recommendations_inbox_get = true;
    log.info?.("[routes] mounted GET /api/recommendations/inbox");
  }
};
