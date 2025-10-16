// server/v2/routes/projects/recommendations.get.js
/**
 * GET /api/v2/projects/:id/recommendations
 * Auth: required
 * Visibility: owner OR project is live; else 404
 * Query: page, pageSize
 * Response: { items, total, page, pageSize }
 */
module.exports = (router, ctx) => {
  const { db, auth, extractLocationTokens } = ctx;

  router.get("/projects/:id/recommendations", auth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const proj = db
      .prepare(
        `SELECT ownerUserId, status, location FROM projects WHERE id = ?`
      )
      .get(id);
    if (!proj) return res.status(404).json({ error: "Not found" });

    const status = String(proj.status || "").toLowerCase();
    const isLive = status === "live";
    const uid = req.user?.uid || null;
    const isOwner = uid && String(uid) === String(proj.ownerUserId);

    if (!isOwner && !isLive) {
      return res.status(404).json({ error: "Not found" });
    }

    const pTok = extractLocationTokens(proj.location);

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.max(
      1,
      Math.min(50, parseInt(String(req.query.pageSize ?? "10"), 10))
    );
    const offset = (page - 1) * pageSize;

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM recommendations WHERE projectId = ?`)
      .get(id);

    const raw = db
      .prepare(
        `
        SELECT
          r.id, r.name, r.email, r.phone, r.company, r.comment, r.isAnonymous, r.createdAt, r.source,
          r.recommenderUserId,
          r.rating,
          u.postcode        AS u_postcode,
          u.postcodeSector  AS u_sector,
          u.postcodeOutward AS u_outward,
          u.city            AS u_city,
          COALESCE(v.likes, 0) AS likes,
          CASE WHEN mv.userId IS NULL THEN 0 ELSE 1 END AS myLike
        FROM recommendations r
        LEFT JOIN (
          SELECT recommendationId, COUNT(*) AS likes
            FROM recommendation_votes
           WHERE value = 1
           GROUP BY recommendationId
        ) v ON v.recommendationId = r.id
        LEFT JOIN recommendation_votes mv
               ON mv.recommendationId = r.id AND mv.userId = ?
        LEFT JOIN users u
               ON u.uid = r.recommenderUserId
        WHERE r.projectId = ?
        ORDER BY likes DESC, r.createdAt DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(uid || "", id, pageSize, offset);

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

    const items = raw.map((r) => ({
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
      likes: r.likes,
      myLike: r.myLike ? 1 : 0,
      rating: r.rating ?? null,
    }));

    return res.json({ items, total: totalRow.c || 0, page, pageSize });
  });
};
