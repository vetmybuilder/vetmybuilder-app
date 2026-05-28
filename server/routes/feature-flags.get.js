// GET /api/feature-flags
// Public flag map the frontend reads to show/hide gated UI. No auth.
const { loadFlags } = require("../lib/featureFlags");

module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;

  router.get("/feature-flags", async (_req, res) => {
    try {
      const flags = await loadFlags(mysqlQuery);
      res.set("Cache-Control", "public, max-age=30");
      res.json({ flags });
    } catch {
      res.json({ flags: {} });
    }
  });
};
