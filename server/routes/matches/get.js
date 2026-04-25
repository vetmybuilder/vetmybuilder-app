// server/routes/matches/get.js
//
// GET /api/matches/:matchId
// Returns contact details for a matched swipe-interest pair.
//
// Schema notes (real columns as of 2026-04):
//   swipe_interest.builder_uid / homeowner_uid / project_id / status
//   users.uid / firstName / email   (users table has NO phone column)
//   tradesmen.user_id / company_name / phone / email
//
// Viewer can be either side of the match:
//   - Builder viewing: sees the homeowner's name + email (homeowners have no phone).
//   - Homeowner viewing: sees the builder's company name + phone + email.

module.exports = function mountMatchGet(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get("/matches/:matchId", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const matchId = Number(req.params.matchId);
    if (!Number.isFinite(matchId) || matchId <= 0) {
      return res.status(400).json({ error: "Invalid match id" });
    }

    const rows = await mysqlQuery(
      `SELECT si.builder_uid, si.homeowner_uid, si.project_id,
              bu.firstName     AS builderFirstName,
              bu.email         AS builderUserEmail,
              ou.firstName     AS homeownerFirstName,
              ou.email         AS homeownerEmail,
              t.company_name   AS companyName,
              t.phone          AS builderPhone,
              t.email          AS builderTradeEmail
         FROM swipe_interest si
         JOIN users bu     ON bu.uid = si.builder_uid
         JOIN users ou     ON ou.uid = si.homeowner_uid
         LEFT JOIN tradesmen t ON t.user_id = si.builder_uid
        WHERE si.id = ?
          AND si.status = 'matched'
          AND (si.builder_uid = ? OR si.homeowner_uid = ?)
        LIMIT 1`,
      [matchId, uid, uid],
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "not found" });
    }

    const r = rows[0];
    const viewerIsBuilder = r.builder_uid === uid;

    if (viewerIsBuilder) {
      // Builder viewing — show homeowner contact (no phone in schema).
      return res.json({
        match: {
          builderName: r.companyName || r.builderFirstName || "Builder",
          homeownerName: r.homeownerFirstName || "Homeowner",
          phone: "",
          email: r.homeownerEmail || "",
        },
      });
    }

    // Homeowner viewing — show builder contact (prefer tradesmen.email/phone).
    return res.json({
      match: {
        builderName: r.companyName || r.builderFirstName || "Builder",
        homeownerName: r.homeownerFirstName || "Homeowner",
        phone: r.builderPhone || "",
        email: r.builderTradeEmail || r.builderUserEmail || "",
      },
    });
  });
};
