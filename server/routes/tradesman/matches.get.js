// server/routes/tradesman/matches.get.js
//
// GET /api/tradesman/matches
// Returns the formed matched pairs for the authenticated builder - rows
// in swipe_interest where both sides have right-swiped (status='matched').
// This is the builder-side analogue of the homeowner's /api/matches list:
// each row carries enough info for /tradesman/matches to render a card
// per match with a chat / view-match deep link.
//
// Note: there is also /api/tradesman/incoming-interest, which surfaces
// status='pending' rows where the homeowner has swiped but the builder
// hasn't responded yet - that drives the /tradesman/leads swipe deck.
// Keep the two endpoints separate so each list has predictable semantics
// (matched pairs vs. queue of decisions to make).

const { mysqlQuery: _mq } = require("../../lib/mysql");

module.exports = function mountTradesmanMatches(router, ctx) {
  const mysqlQuery = ctx?.mysqlQuery ?? _mq;
  const auth = ctx?.auth;

  router.get("/tradesman/matches", auth, async (req, res) => {
    const builderUid = req.user?.uid;
    if (!builderUid) return res.status(401).json({ error: "Unauthorized" });

    const rows = await mysqlQuery(
      `SELECT si.id              AS matchId,
              si.project_id      AS projectId,
              si.source          AS source,
              si.updated_at      AS matchedAt,
              p.name             AS projectName,
              p.type             AS projectType,
              p.location         AS projectLocation,
              u.firstName        AS homeownerFirstName
         FROM swipe_interest si
         JOIN projects p ON p.id = si.project_id
         JOIN users u ON u.uid = si.homeowner_uid
        WHERE si.builder_uid = ?
          AND si.status = 'matched'
        ORDER BY si.updated_at DESC, si.id DESC`,
      [builderUid],
    );

    const matches = (rows || []).map((r) => ({
      matchId: String(r.matchId),
      projectId: r.projectId,
      projectName: r.projectName || "",
      projectType: r.projectType || "",
      projectLocation: r.projectLocation || "",
      homeownerFirstName: r.homeownerFirstName || "Homeowner",
      source: r.source === "recommended" ? "recommended" : "subscribed",
      matchedAt: r.matchedAt,
    }));

    return res.json({ matches });
  });
};
