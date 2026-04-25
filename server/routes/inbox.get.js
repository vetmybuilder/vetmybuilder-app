// server/routes/inbox.get.js
//
// GET /api/inbox
// Homeowner-only. Aggregates inbox_messages across ALL projects the caller owns.
// Returns pitches with status derived server-side and an unreadCount of new pitches.

const { mysqlQuery: _mq } = require("../lib/mysql");

module.exports = function mountGlobalInbox(router, ctx) {
  const mysqlQuery = ctx?.mysqlQuery ?? _mq;
  const auth = ctx?.auth;
  router.get("/inbox", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const rows = await mysqlQuery(
      `SELECT im.id AS messageId,
              im.project_id AS projectId,
              p.name AS projectTitle,
              im.builder_uid AS builderUid,
              bu.firstName AS builderFirstName,
              t.company_name AS companyName,
              GREATEST(0, TIMESTAMPDIFF(YEAR, t.created_at, NOW())) AS yearsTrading,
              COALESCE(NULLIF(bu.postcodeOutward, ''), SUBSTRING_INDEX(t.service_areas, ',', 1), '') AS outward,
              im.intro_message AS body,
              TIMESTAMPDIFF(HOUR, im.created_at, NOW()) AS hoursAgo,
              im.dismissed_at, im.homeowner_replied_at
       FROM inbox_messages im
       JOIN projects p ON p.id = im.project_id
       LEFT JOIN users bu ON bu.uid = im.builder_uid
       LEFT JOIN tradesmen t ON t.user_id = im.builder_uid
       WHERE p.ownerUserId = ?
         AND im.intro_message IS NOT NULL
       ORDER BY im.created_at DESC`,
      [uid],
    );

    const pitches = (rows || []).map((r) => {
      let status = "new";
      if (r.dismissed_at) status = "dismissed";
      else if (r.homeowner_replied_at) status = "replied";
      return {
        messageId: r.messageId,
        projectId: r.projectId,
        projectTitle: r.projectTitle,
        builderFirstName: r.builderFirstName || "",
        companyName: r.companyName || "",
        yearsTrading: Number(r.yearsTrading) || 0,
        outward: String(r.outward || ""),
        body: r.body || "",
        hoursAgo: Math.max(0, Number(r.hoursAgo) || 0),
        status,
      };
    });

    const unreadCount = pitches.filter((p) => p.status === "new").length;
    res.json({ pitches, unreadCount });
  });
};
