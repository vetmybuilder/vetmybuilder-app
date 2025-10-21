// server/v2/routes/tradesmen/top.get.js
/**
 * GET /api/tradesmen/top
 * Auth: required
 * Query: page, pageSize (defaults 1, 10), order=desc|asc (score)
 * Returns: { items, total, page, pageSize }
 *
 * Scoring:
 *  1) were they recommended (count of distinct recommenders)          -> weight 1.0 each
 *  2) completed projects (count)                                      -> weight 2.0 each
 *  3) vote up on recommendations (sum of +1 votes)                    -> weight 0.5 each
 *  4) photos on completed projects (count of photos, min aggregated)  -> weight 0.3 each (extra boost if >=2)
 *  5) positive review (wouldUseAgain=1 count)                         -> weight 2.5 each
 *
 * Columns returned:
 *   builderId, tradesmanName, verified (0/1), recommenderName, photosCount, starRating (0..5), score
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.get("/tradesmen/top", auth, (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10))
    );
    const order =
      String(req.query.order).toLowerCase() === "asc" ? "ASC" : "DESC";
    const offset = (page - 1) * pageSize;

    // Heavily defensive COALESCEs to tolerate schema column name variants
    const rows = db
      .prepare(
        `
WITH rec AS (
  SELECT
    COALESCE(r.builderUserId, r.builderId, r.tradesmanId, r.tradesmanUserId, r.userId) AS builderId,
    r.recommenderUserId,
    r.id AS recommendationId
  FROM recommendations r
  WHERE builderId IS NOT NULL
),
rec_by_builder AS (
  SELECT
    builderId,
    COUNT(DISTINCT recommenderUserId) AS recommendedCount
  FROM rec
  GROUP BY builderId
),
votes AS (
  SELECT
    recommendationId,
    SUM(CASE WHEN v.vote=1 THEN 1 ELSE 0 END) AS upVotes
  FROM recommendation_votes v
  GROUP BY recommendationId
),
votes_by_builder AS (
  SELECT
    r.builderId,
    COALESCE(SUM(v.upVotes), 0) AS voteUps
  FROM rec r
  LEFT JOIN votes v ON v.recommendationId = r.recommendationId
  GROUP BY r.builderId
),
wins AS (
  SELECT
    pc.winnerRecommendationId AS recId,
    p.id AS projectId,
    p.ownerUserId AS ownerUserId
  FROM project_closures pc
  JOIN projects p ON p.id = pc.projectId
  WHERE p.status='completed' AND pc.winnerRecommendationId IS NOT NULL
),
win_with_builder AS (
  SELECT
    COALESCE(rr.builderUserId, rr.builderId, rr.tradesmanId, rr.tradesmanUserId, rr.userId) AS builderId,
    w.projectId
  FROM wins w
  JOIN recommendations rr ON rr.id = w.recId
),
completed_by_builder AS (
  SELECT
    builderId,
    COUNT(*) AS completedCount
  FROM win_with_builder
  GROUP BY builderId
),
photos_by_project AS (
  SELECT projectId, COUNT(*) AS c FROM project_closure_photos GROUP BY projectId
),
photos_by_builder AS (
  SELECT
    w.builderId,
    COALESCE(SUM(pb.c), 0) AS photosCount
  FROM win_with_builder w
  LEFT JOIN photos_by_project pb ON pb.projectId = w.projectId
  GROUP BY w.builderId
),
would_use_again_by_builder AS (
  SELECT
    w.builderId,
    COALESCE(SUM(CASE WHEN pc.wouldUseAgain=1 THEN 1 ELSE 0 END),0) AS wouldUseAgainCount
  FROM win_with_builder w
  JOIN project_closures pc ON pc.projectId = w.projectId
  GROUP BY w.builderId
),
recommender_name AS (
  -- choose the most frequent recommender for that builder
  SELECT
    r.builderId,
    r.recommenderUserId,
    COUNT(*) AS c
  FROM rec r
  GROUP BY r.builderId, r.recommenderUserId
),
best_recommender AS (
  SELECT builderId, recommenderUserId
  FROM (
    SELECT
      rn.*,
      ROW_NUMBER() OVER (PARTITION BY builderId ORDER BY c DESC) AS rn_
    FROM recommender_name rn
  ) t
  WHERE rn_=1
),
builder_profile AS (
  SELECT
    u.uid AS builderId,
    COALESCE(u.displayName, u.name, u.fullName, u.email, 'Tradesman') AS tradesmanName,
    CASE WHEN u.verified=1 THEN 1 ELSE 0 END AS verified
  FROM users u
)
SELECT
  bp.builderId,
  bp.tradesmanName,
  bp.verified,
  COALESCE((SELECT COALESCE(u.displayName,u.name,u.fullName,u.email) FROM users u WHERE u.uid = br.recommenderUserId), NULL) AS recommenderName,
  COALESCE(pbb.photosCount, 0) AS photosCount,
  COALESCE(rbb.recommendedCount, 0) AS recommendedCount,
  COALESCE(vbb.voteUps, 0) AS voteUps,
  COALESCE(cbb.completedCount, 0) AS completedCount,
  COALESCE(wuab.wouldUseAgainCount, 0) AS wouldUseAgainCount
FROM builder_profile bp
LEFT JOIN rec_by_builder rbb ON rbb.builderId = bp.builderId
LEFT JOIN votes_by_builder vbb ON vbb.builderId = bp.builderId
LEFT JOIN completed_by_builder cbb ON cbb.builderId = bp.builderId
LEFT JOIN photos_by_builder pbb ON pbb.builderId = bp.builderId
LEFT JOIN would_use_again_by_builder wuab ON wuab.builderId = bp.builderId
LEFT JOIN best_recommender br ON br.builderId = bp.builderId
WHERE (COALESCE(cbb.completedCount,0) > 0) -- only those who completed at least one project
`
      )
      .all();

    // scoring
    const itemsScored = rows.map((r) => {
      const recommended = Number(r.recommendedCount || 0);
      const completed = Number(r.completedCount || 0);
      const voteUps = Number(r.voteUps || 0);
      const photos = Number(r.photosCount || 0);
      const wouldUseAgain = Number(r.wouldUseAgainCount || 0);

      const score =
        1.0 * recommended +
        2.0 * completed +
        0.5 * voteUps +
        0.3 * photos +
        2.5 * wouldUseAgain +
        (photos >= 2 ? 0.7 : 0); // small bonus for 2+ photos

      // normalize to 0..5 stars (simple min-max cap)
      // Here we map score using a soft scale; feel free to adjust divisor.
      const starRating = Math.max(0, Math.min(5, score / 3));

      return { ...r, score, starRating: Number(starRating.toFixed(1)) };
    });

    const total = itemsScored.length;
    const sorted = itemsScored.sort((a, b) =>
      order === "ASC" ? a.score - b.score : b.score - a.score
    );
    const pageItems = sorted.slice(offset, offset + pageSize);

    return res.json({
      items: pageItems,
      total,
      page,
      pageSize,
    });
  });
};
