// server/routes/pilot/areas.get.js
//
// GET /api/pilot/areas
//
// Public read-only endpoint. Returns the boroughs we currently accept
// project postings from. The LocationField uses this list to validate a
// picked postcode against the enabled set (using meta.admin_district
// from postcodes.io), and to render the "we're piloting in X" copy.
//
// Response shape: { boroughs: [{ name }, ...] }
//
// No auth required - which boroughs we cover is public information used
// to shape the homeowner UX.

const { getEnabledBoroughs } = require("../../lib/pilotAreas");

module.exports = function mountPilotAreasGet(router, ctx) {
  const { mysqlQuery } = ctx;

  router.get("/pilot/areas", async (_req, res) => {
    try {
      const boroughs = await getEnabledBoroughs(mysqlQuery);
      res.set("Cache-Control", "public, max-age=60");
      return res.status(200).json({
        boroughs: boroughs.map((b) => ({ name: b.name })),
      });
    } catch (err) {
      ctx.log?.error?.(
        { err: err?.message },
        "[GET /api/pilot/areas] failed",
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
