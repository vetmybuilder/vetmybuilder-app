// server/routes/pilot/project-types.get.js
//
// GET /api/pilot/project-types
//
// Public read-only endpoint. Returns the project-type leaves we currently
// accept project postings for, plus the set of categories that have at
// least one enabled leaf (so the homeowner picker can grey whole-category
// cards with "Coming soon" without inferring from the leaf list).
//
// Response shape:
//   {
//     types: [{ typeName, category }, ...],
//     categories: [string, ...]   // categories with >= 1 enabled leaf
//   }
//
// No auth - which trades VMB supports is public.

const {
  listProjectTypes,
  getEnabledProjectTypes,
  getEnabledCategoryNameSet,
} = require("../../lib/pilotProjectTypes");

module.exports = function mountPilotProjectTypesGet(router, ctx) {
  const { mysqlQuery } = ctx;

  router.get("/pilot/project-types", async (_req, res) => {
    try {
      // PILOT_PROJECT_TYPES_OPEN=1 unlocks the picker UI for the E2E suite,
      // which still tests Appliances/Flooring/etc flows that are disabled
      // at launch. Set only in .env.e2e.local so local dev still gets the
      // real "Coming soon" greying. Server-side POST gate uses a separate
      // flag (PILOT_AREAS_BYPASS) for the same reason.
      if (process.env.PILOT_PROJECT_TYPES_OPEN === "1") {
        const all = await listProjectTypes(mysqlQuery);
        const categories = Array.from(new Set(all.map((t) => t.category))).sort();
        res.set("Cache-Control", "no-store, max-age=0");
        return res.status(200).json({
          types: all.map((t) => ({
            typeName: t.typeName,
            category: t.category,
          })),
          categories,
        });
      }

      const enabled = await getEnabledProjectTypes(mysqlQuery);
      const categories = Array.from(
        await getEnabledCategoryNameSet(mysqlQuery),
      ).sort();
      res.set("Cache-Control", "public, max-age=60");
      return res.status(200).json({
        types: enabled.map((t) => ({
          typeName: t.typeName,
          category: t.category,
        })),
        categories,
      });
    } catch (err) {
      ctx.log?.error?.(
        { err: err?.message },
        "[GET /api/pilot/project-types] failed",
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
