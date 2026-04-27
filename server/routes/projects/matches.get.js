// server/routes/projects/matches.get.js
//
// GET /api/projects/:id/matches
// Returns the ranked swipe deck for a homeowner's project.
//   { recommended: [...], subscribed: [...] }
//
// Column mapping (real schema as of 2026-04):
//   projects.ownerUserId          — owner uid (camelCase)
//   projects.location             — free-text location; we derive outward
//   tradesmen.company_name        — display name
//   tradesmen.trade_types         — CSV string; first segment = primary
//   tradesmen.service_areas       — CSV string of outward codes
//   tradesmen.vmb_score           — base reputation score
//   recommendations.projectId     — FK to project (camelCase)
//   recommendations.linked_tradesman_uid — FK to tradesmen.user_id (nullable)
//   project_classifications.structured   — JSON with recommended_trades etc.

const { rankBuilders } = require("../../lib/matching/rankBuilders");
const { expireSwipeInterests } = require("../../lib/matching/expireSwipeInterests");
const { extractOutward } = require("../../lib/matching/extractOutward");

function splitCsv(v) {
  if (!v || typeof v !== "string") return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function rowToCandidate(row, tier, recommenderName) {
  const trades = splitCsv(row.trade_types);
  const cvStatus = String(row.cvStatus || "").toLowerCase();
  const chStatus = String(row.chStatus || "").toLowerCase();
  const chVerified =
    cvStatus === "verified" ||
    cvStatus === "matched" ||
    chStatus === "verified" ||
    chStatus === "matched";
  const isRec = tier === "recommended";
  return {
    uid: row.user_id,
    displayName: row.company_name || "Builder",
    companyName: row.company_name || "Builder",
    photoUrl: row.photoUrl || null,
    starRating: row.starRating == null ? null : Number(row.starRating),
    reviewCount: Number(row.reviewCount) || 0,
    yearsTrading: Number(row.yearsTrading) || 0,
    chVerified,
    whyMatch: isRec
      ? "Recommended · Free to contact"
      : "Matched on area + trade",
    tier: isRec ? "recommended" : "ai-matched",
    recommenderName: isRec ? recommenderName || undefined : undefined,
    // Internal-only, used by rankBuilders. Returned harmlessly.
    primaryTrade: trades[0] || null,
    secondaryTrades: trades.slice(1),
    serviceAreas: splitCsv(row.service_areas),
    priceBand: null, // not currently modelled on tradesmen
    baseScore: Number(row.vmb_score) || 0,
    recommendationId: row.recommendationId ?? null,
  };
}

module.exports = function mountMatchesGet(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get("/projects/:id/matches", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const pid = Number(req.params.id);
    if (!Number.isFinite(pid) || pid <= 0) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    await expireSwipeInterests(mysqlQuery);

    const projectRows = await mysqlQuery(
      `SELECT id, ownerUserId, location
         FROM projects
        WHERE id = ?
        LIMIT 1`,
      [pid],
    );
    const project = projectRows?.[0];
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (String(project.ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "Not your project" });
    }

    const classRows = await mysqlQuery(
      `SELECT structured
         FROM project_classifications
        WHERE project_id = ?
        ORDER BY classified_at DESC
        LIMIT 1`,
      [pid],
    );
    const classRaw = classRows?.[0]?.structured;
    let classification = {};
    if (classRaw) {
      if (typeof classRaw === "string") {
        try {
          classification = JSON.parse(classRaw);
        } catch {
          classification = {};
        }
      } else {
        classification = classRaw;
      }
    }

    const swiped = await mysqlQuery(
      `SELECT builder_uid
         FROM swipe_interest
        WHERE project_id = ?`,
      [pid],
    );
    const swipedSet = new Set((swiped || []).map((r) => r.builder_uid));

    const recRows = await mysqlQuery(
      `SELECT t.user_id, t.company_name, t.trade_types,
              t.service_areas, t.vmb_score,
              t.profile_picture_url AS photoUrl,
              t.google_rating AS starRating,
              COALESCE(t.google_reviews_count, 0) AS reviewCount,
              GREATEST(0, TIMESTAMPDIFF(YEAR, t.created_at, NOW())) AS yearsTrading,
              t.ch_status AS chStatus,
              cv_agg.cvStatus AS cvStatus,
              r.recommenderUserId AS recommenderUserId,
              r.id AS recommendationId
         FROM recommendations r
         JOIN tradesmen t ON t.user_id = r.linked_tradesman_uid
         LEFT JOIN (
           SELECT companyNumber,
                  MAX(CASE WHEN LOWER(status) = 'verified' THEN 'verified'
                           WHEN LOWER(status) = 'matched'  THEN 'matched'
                           ELSE LOWER(status) END) AS cvStatus
             FROM company_verifications
            WHERE companyNumber IS NOT NULL AND companyNumber <> ''
            GROUP BY companyNumber
         ) cv_agg ON cv_agg.companyNumber = t.company_number
        WHERE r.projectId = ?
          AND r.linked_tradesman_uid IS NOT NULL`,
      [pid],
    );

    const subRows = await mysqlQuery(
      `SELECT t.user_id, t.company_name, t.trade_types,
              t.service_areas, t.vmb_score,
              t.profile_picture_url AS photoUrl,
              t.google_rating AS starRating,
              COALESCE(t.google_reviews_count, 0) AS reviewCount,
              GREATEST(0, TIMESTAMPDIFF(YEAR, t.created_at, NOW())) AS yearsTrading,
              t.ch_status AS chStatus,
              cv_agg.cvStatus AS cvStatus
         FROM tradesmen t
         JOIN builder_subscriptions s ON s.user_id = t.user_id
         LEFT JOIN (
           SELECT companyNumber,
                  MAX(CASE WHEN LOWER(status) = 'verified' THEN 'verified'
                           WHEN LOWER(status) = 'matched'  THEN 'matched'
                           ELSE LOWER(status) END) AS cvStatus
             FROM company_verifications
            WHERE companyNumber IS NOT NULL AND companyNumber <> ''
            GROUP BY companyNumber
         ) cv_agg ON cv_agg.companyNumber = t.company_number
        WHERE s.status = 'active'
          AND s.current_period_end > NOW()`,
    );

    // Batch-resolve recommender first names so the tier badge can read
    // "Recommended by Alex" rather than "Recommended by your network".
    const recommenderById = new Map();
    const recommenderUids = Array.from(
      new Set(
        (recRows || [])
          .map((r) => r.recommenderUserId)
          .filter((u) => u != null && String(u).length > 0),
      ),
    );
    if (recommenderUids.length > 0) {
      const placeholders = recommenderUids.map(() => "?").join(",");
      const userRows = await mysqlQuery(
        `SELECT uid, firstName FROM users WHERE uid IN (${placeholders})`,
        recommenderUids,
      );
      for (const u of userRows || []) {
        if (u && u.uid) {
          recommenderById.set(String(u.uid), u.firstName || null);
        }
      }
    }

    const recommendedCandidates = (recRows || [])
      .map((r) =>
        rowToCandidate(
          r,
          "recommended",
          r.recommenderUserId
            ? recommenderById.get(String(r.recommenderUserId)) || null
            : null,
        ),
      )
      .filter((c) => !swipedSet.has(c.uid));
    const subscribedCandidates = (subRows || [])
      .map((r) => rowToCandidate(r, "subscribed"))
      .filter((c) => !swipedSet.has(c.uid))
      .filter((c) => !recommendedCandidates.some((r) => r.uid === c.uid));

    const projectCtx = {
      id: project.id,
      outward: extractOutward(project.location),
      classification,
    };

    const recRanked = rankBuilders({
      project: projectCtx,
      candidates: recommendedCandidates,
    });
    const subRanked = rankBuilders({
      project: projectCtx,
      candidates: subscribedCandidates,
    });

    const offPlatformRows = await mysqlQuery(
      `SELECT COUNT(*) AS c FROM recommendations
        WHERE projectId = ? AND linked_tradesman_uid IS NULL`,
      [pid],
    );
    const offPlatformRecCount = Number(offPlatformRows?.[0]?.c || 0);

    return res.status(200).json({
      recommended: recRanked,
      subscribed: subRanked,
      offPlatformRecCount,
    });
  });
};
