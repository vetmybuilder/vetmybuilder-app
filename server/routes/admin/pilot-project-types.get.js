// server/routes/admin/pilot-project-types.get.js
//
// GET /api/admin/pilot-project-types
//
// Admin-only. Lists every leaf in the canonical project-type catalog
// with its current `enabled` flag and parent category, so the admin UI
// can render a grouped list of toggles.
//
// Response shape:
//   { types: [{ typeName, category, enabled }, ...] }

const { listProjectTypes } = require("../../lib/pilotProjectTypes");

module.exports = function mountAdminPilotProjectTypesGet(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get(
    "/admin/pilot-project-types",
    auth,
    requireAdmin(ctx),
    async (_req, res) => {
      try {
        const types = await listProjectTypes(mysqlQuery);
        return res.status(200).json({ types });
      } catch (err) {
        ctx.log?.error?.(
          { err: err?.message },
          "[GET /api/admin/pilot-project-types] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );
};
