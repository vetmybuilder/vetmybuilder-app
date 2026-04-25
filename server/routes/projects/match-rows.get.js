// server/routes/projects/match-rows.get.js
//
// GET /api/projects/:id/match-rows
// Returns the homeowner's match rows for a project, derived from swipe_interest
// joined with the builder's tradesmen/users records.
//
// Response shape:
//   { matches: MatchRow[] } where MatchRow = {
//     matchId, builderFirstName, companyName, trades: string[],
//     source: "recommended" | "ai-matched",
//     status: "new" | "contacted" | "archived",
//     whyMatch: string,
//   }

const { mysqlQuery: _mq } = require("../../lib/mysql");

module.exports = function mountMatchRows(router, ctx) {
  const mysqlQuery = ctx?.mysqlQuery ?? _mq;
  const auth = ctx?.auth;
  router.get("/projects/:id/match-rows", auth, async (req, res) => {
    const homeownerUid = req.user.uid;
    const projectId = req.params.id;
    const owned = await mysqlQuery(
      `SELECT id FROM projects WHERE id = ? AND ownerUserId = ?`,
      [projectId, homeownerUid],
    );
    if (!owned || owned.length === 0) {
      return res.status(403).json({ error: "not your project" });
    }

    const rows = await mysqlQuery(
      `SELECT si.id AS matchId, si.source, si.status,
              si.builder_uid, t.company_name AS companyName,
              t.trade_types AS trades,
              u.firstName AS builderFirstName
       FROM swipe_interest si
       JOIN tradesmen t ON t.user_id = si.builder_uid
       JOIN users u ON u.uid = si.builder_uid
       WHERE si.project_id = ?`,
      [projectId],
    );

    const matches = rows.map((r) => ({
      matchId: r.matchId,
      builderFirstName: r.builderFirstName,
      companyName: r.companyName,
      trades: String(r.trades || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      source: r.source === "recommended" ? "recommended" : "ai-matched",
      status:
        r.status === "matched"
          ? "contacted"
          : r.status === "pending"
            ? "new"
            : "archived",
      whyMatch:
        r.source === "recommended"
          ? "Free to contact"
          : "Matched on area + trade",
    }));

    res.json({ matches });
  });
};
