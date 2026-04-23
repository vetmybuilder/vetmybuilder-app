// server/routes/boroughs/search.get.js
//
// GET /api/boroughs/search?q=<query>
//
// Case-insensitive substring match over the London launch-area boroughs
// in server/lib/boroughPostcodes.js. Returns up to 10 results.
// No auth required (same public-data footing as postcodes.io usage).

const { BOROUGH_POSTCODES } = require("../../lib/boroughPostcodes");

module.exports = function mountBoroughsSearch(router /*, ctx */) {
  router.get("/boroughs/search", async (req, res) => {
    const raw = typeof req.query.q === "string" ? req.query.q : "";
    const q = raw.trim().toLowerCase();
    if (q.length < 2) return res.status(200).json([]);

    const matches = Object.entries(BOROUGH_POSTCODES)
      .filter(([name]) => name.toLowerCase().includes(q))
      .slice(0, 10)
      .map(([name, outwardCodes]) => ({ name, outwardCodes }));

    return res.status(200).json(matches);
  });
};
