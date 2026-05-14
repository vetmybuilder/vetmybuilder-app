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
  getEnabledProjectTypes,
  getEnabledCategoryNameSet,
} = require("../../lib/pilotProjectTypes");

module.exports = function mountPilotProjectTypesGet(router, ctx) {
  const { mysqlQuery } = ctx;

  router.get("/pilot/project-types", async (_req, res) => {
    try {
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
