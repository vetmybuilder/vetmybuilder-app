module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get("/admin/pricing", auth, requireAdmin(ctx), async (req, res) => {
    try {
      const rows = await mysqlQuery(
        "SELECT * FROM pricing_lookup ORDER BY subtype_normalised"
      );
      res.json({ items: rows });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch pricing" });
    }
  });
};
