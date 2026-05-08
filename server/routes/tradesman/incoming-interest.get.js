// server/routes/tradesman/incoming-interest.get.js
//
// GET /api/tradesman/incoming-interest
// Returns pending swipe_interest rows for the authenticated builder,
// shaped for the incoming-interest deck on /tradesman/matches.

const { mysqlQuery: _mq } = require("../../lib/mysql");
const {
  isBuilderSubscribed,
} = require("../../lib/subscriptions/isBuilderSubscribed");
const { extractOutward } = require("../../lib/matching/extractOutward");

module.exports = function mountIncomingInterest(router, ctx) {
  const mysqlQuery = ctx?.mysqlQuery ?? _mq;
  const auth = ctx?.auth;

  router.get("/tradesman/incoming-interest", auth, async (req, res) => {
    const builderUid = req.user?.uid;
    if (!builderUid) return res.status(401).json({ error: "Unauthorized" });

    // projects table has no budget_band / start_window columns, so we
    // return empty strings for those. recommenderName has no direct
    // column here either — leave undefined. See mysql_schema.sql.
    // Caller sees their own pending leads plus any pending leads on
    // ghost tradespeople they "operate" (master_uid = caller). For real
    // users this is just their own row; for the staging sim master it
    // aggregates incoming interest across every persona they own.
    const rows = await mysqlQuery(
      `SELECT si.id AS matchId,
              si.project_id AS projectId,
              si.builder_uid AS builderUid,
              si.source,
              p.name AS title,
              p.location AS outward,
              p.description AS description,
              u.firstName AS homeownerFirstName,
              TIMESTAMPDIFF(HOUR, si.homeowner_swiped_at, NOW()) AS pickedHoursAgo,
              t.trade_types AS trades,
              t.company_name AS builderCompanyName,
              t.master_uid AS builderMasterUid
         FROM swipe_interest si
         JOIN projects p ON p.id = si.project_id
         JOIN users u ON u.uid = si.homeowner_uid
         LEFT JOIN tradesmen t ON t.user_id = si.builder_uid
        WHERE (si.builder_uid = ?
               OR si.builder_uid IN (
                 SELECT user_id FROM tradesmen WHERE master_uid = ?
               ))
          AND si.status = 'pending'
        ORDER BY si.homeowner_swiped_at DESC`,
      [builderUid, builderUid],
    );

    const subscriptionActive = await isBuilderSubscribed(
      builderUid,
      mysqlQuery,
    );

    // Privacy: a pending swipe_interest row is pre-match - the homeowner
    // has shown intent but the tradesman hasn't paid or reciprocated, so
    // we surface neither the homeowner's first name nor the full
    // postcode. Both are scrubbed in the response shaper so a UI bug
    // can't accidentally re-expose either field.
    const leads = (rows || []).map((r) => ({
      matchId: r.matchId,
      projectId: r.projectId,
      title: r.title,
      budget: "",
      outward: extractOutward(r.outward) || "",
      startWindow: "",
      homeownerFirstName: null,
      description: r.description,
      trades: String(r.trades || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      source: r.source === "recommended" ? "recommended" : "subscribed",
      recommenderName: undefined,
      pickedHoursAgo: r.pickedHoursAgo || 0,
      // Persona attribution for the master inbox.
      builderCompanyName: r.builderCompanyName || null,
      actingAsGhost:
        !!r.builderMasterUid && r.builderMasterUid === builderUid,
    }));

    return res.status(200).json({ leads, subscriptionActive });
  });
};
