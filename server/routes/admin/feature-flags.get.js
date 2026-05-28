// GET /api/admin/feature-flags
// Admin: full flag list (code definitions merged with DB state) for the
// admin feature-flags page.
const { FLAG_DEFINITIONS, loadFlags } = require("../../lib/featureFlags");

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get("/admin/feature-flags", auth, requireAdmin(ctx), async (_req, res) => {
    try {
      const flags = await loadFlags(mysqlQuery);
      let meta = {};
      try {
        const rows = await mysqlQuery("SELECT flag_key, updated_at, updated_by FROM feature_flags");
        for (const r of rows || []) meta[r.flag_key] = { updatedAt: r.updated_at, updatedBy: r.updated_by };
      } catch {}

      const items = FLAG_DEFINITIONS.map((def) => ({
        key: def.key,
        label: def.label,
        description: def.description,
        enabled: !!flags[def.key],
        default: def.default,
        updatedAt: meta[def.key]?.updatedAt || null,
        updatedBy: meta[def.key]?.updatedBy || null,
      }));

      res.json({ flags: items });
    } catch {
      res.status(500).json({ error: "internal_error" });
    }
  });
};
