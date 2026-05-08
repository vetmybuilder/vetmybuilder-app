// server/routes/matches/get.js
//
// GET /api/matches/:matchId
// Returns details for a swipe-interest pair the caller participates in.
//
// Schema notes (real columns as of 2026-04):
//   swipe_interest.builder_uid / homeowner_uid / project_id / status
//                  / homeowner_swiped_at / builder_swiped_at
//   users.uid / firstName / email   (users table has NO phone column)
//   tradesmen.user_id / company_name / phone / email
//
// The endpoint serves three states the UI cares about:
//   - 'matched'  : both swiped right. Contact details (phone/email) revealed.
//   - 'pending'  : exactly one side has swiped. Contact details withheld.
//                  Viewer can be the one waiting OR the one with an
//                  outstanding decision; the response carries enough info
//                  for the client to show the correct copy and CTA.
//   - others     : 404 (declined / expired rows shouldn't be reachable).

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
      `SELECT si.id, si.builder_uid, si.homeowner_uid, si.project_id,
              si.status,
              si.homeowner_swiped_at, si.builder_swiped_at,
              bu.firstName     AS builderFirstName,
              bu.email         AS builderUserEmail,
              ou.firstName     AS homeownerFirstName,
              ou.email         AS homeownerEmail,
              t.company_name        AS companyName,
              t.phone               AS builderPhone,
              t.email               AS builderTradeEmail,
              t.profile_picture_url AS builderPhotoUrl
         FROM swipe_interest si
         LEFT JOIN users bu ON bu.uid = si.builder_uid
         JOIN users ou ON ou.uid = si.homeowner_uid
         LEFT JOIN tradesmen t ON t.user_id = si.builder_uid
        WHERE si.id = ?
          AND si.status IN ('matched', 'pending')
          AND (si.builder_uid = ? OR si.homeowner_uid = ?)
        LIMIT 1`,
      [matchId, uid, uid],
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "not found" });
    }

    const r = rows[0];
    const viewerIsBuilder = r.builder_uid === uid;
    const status = r.status;
    const isMatched = status === "matched";
    const homeownerSwiped = r.homeowner_swiped_at != null;
    const builderSwiped = r.builder_swiped_at != null;

    // Common identity fields — visible in every state because the homeowner
    // already sees company name + photo on the matches list, and the builder
    // already sees the homeowner's first name on their jobs list. There's no
    // new disclosure here. Contact channels (phone/email) remain gated.
    const base = {
      status,
      viewerIsBuilder,
      homeownerSwiped,
      builderSwiped,
      projectId: r.project_id,
      builderUid: r.builder_uid,
      builderName: r.companyName || r.builderFirstName || "Builder",
      builderPhotoUrl: r.builderPhotoUrl || null,
      homeownerName: r.homeownerFirstName || "Homeowner",
    };

    if (!isMatched) {
      return res.json({ match: { ...base, phone: "", email: "" } });
    }

    if (viewerIsBuilder) {
      // Builder viewing a matched pair — show homeowner contact (no phone).
      return res.json({
        match: {
          ...base,
          phone: "",
          email: r.homeownerEmail || "",
        },
      });
    }

    // Homeowner viewing a matched pair — prefer tradesmen.email/phone.
    return res.json({
      match: {
        ...base,
        phone: r.builderPhone || "",
        email: r.builderTradeEmail || r.builderUserEmail || "",
      },
    });
  });
};
