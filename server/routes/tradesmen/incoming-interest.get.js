// server/routes/tradesmen/incoming-interest.get.js
//
// GET /api/tradesmen/me/incoming-interest
// Returns all pending swipe_interest rows where the caller is the builder.

const { expireSwipeInterests } = require("../../lib/matching/expireSwipeInterests");
const { extractOutward } = require("../../lib/matching/extractOutward");

module.exports = function mountIncomingInterest(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get("/tradesmen/me/incoming-interest", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    await expireSwipeInterests(mysqlQuery);

    const rows = await mysqlQuery(
      `SELECT si.id, si.project_id, si.homeowner_uid, si.source,
              si.homeowner_swiped_at,
              p.name AS project_title,
              p.description,
              p.location,
              JSON_EXTRACT(pc.structured, '$.price_band_estimate') AS price_band,
              u.firstName AS homeowner_firstname
         FROM swipe_interest si
         JOIN projects p ON p.id = si.project_id
         LEFT JOIN project_classifications pc
           ON pc.project_id = p.id
         LEFT JOIN users u ON u.uid = si.homeowner_uid
        WHERE si.builder_uid = ?
          AND si.status = 'pending'
        ORDER BY si.homeowner_swiped_at DESC`,
      [uid],
    );

    // Privacy: pending swipe_interest is pre-match. Strip the homeowner's
    // name and reduce location to outward only so a UI bug can't leak
    // either field while the builder is still in the gating funnel.
    const items = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      source: r.source,
      homeownerFirstName: null,
      swipedAt: r.homeowner_swiped_at,
      project: {
        title: r.project_title,
        description: r.description,
        location: extractOutward(r.location) || "",
        priceBand:
          typeof r.price_band === "string"
            ? r.price_band.replace(/^"|"$/g, "")
            : r.price_band || null,
      },
    }));

    return res.status(200).json({ items });
  });
};
