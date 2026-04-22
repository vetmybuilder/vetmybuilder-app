module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");
  const { setPriceBand } = require("../../lib/pricingLookup");

  router.put("/admin/pricing/:id", auth, requireAdmin(ctx), async (req, res) => {
    const id = Number(req.params.id);
    const { minPence, maxPence } = req.body || {};

    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    if (!Number.isFinite(minPence) || !Number.isFinite(maxPence)) {
      return res.status(400).json({ error: "minPence and maxPence required" });
    }

    try {
      await mysqlQuery(
        "UPDATE pricing_lookup SET min_pence = ?, max_pence = ?, source = 'manual', reviewed = 1, updated_at = NOW() WHERE id = ?",
        [minPence, maxPence, id]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update pricing" });
    }
  });
};
