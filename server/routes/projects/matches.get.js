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

function rowToCandidate(row, tier) {
  const trades = splitCsv(row.trade_types);
  return {
    uid: row.user_id,
    displayName: row.company_name || "Builder",
    primaryTrade: trades[0] || null,
    secondaryTrades: trades.slice(1),
    serviceAreas: splitCsv(row.service_areas),
    priceBand: null, // not currently modelled on tradesmen
    baseScore: Number(row.vmb_score) || 0,
    tier,
  };
}

module.exports = function mountMatchesGet(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get("/api/projects/:id/matches", auth, async (req, res) => {
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
              t.service_areas, t.vmb_score
         FROM recommendations r
         JOIN tradesmen t ON t.user_id = r.linked_tradesman_uid
        WHERE r.projectId = ?
          AND r.linked_tradesman_uid IS NOT NULL`,
      [pid],
    );

    const subRows = await mysqlQuery(
      `SELECT t.user_id, t.company_name, t.trade_types,
              t.service_areas, t.vmb_score
         FROM tradesmen t
         JOIN builder_subscriptions s ON s.user_id = t.user_id
        WHERE s.status = 'active'
          AND s.current_period_end > NOW()`,
    );

    const recommendedCandidates = (recRows || [])
      .map((r) => rowToCandidate(r, "recommended"))
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

    return res.status(200).json({
      recommended: recRanked,
      subscribed: subRanked,
    });
  });
};
