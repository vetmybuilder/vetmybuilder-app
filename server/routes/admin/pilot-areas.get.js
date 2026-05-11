// server/routes/admin/pilot-areas.get.js
//
// GET /api/admin/pilot-areas
//
// Admin-only. Lists every borough known to the static catalog along with
// its current `enabled` flag, so the admin UI can render a toggle row per
// borough.
//
// Response shape:
//   { boroughs: [{ name, enabled, outwardCodes }, ...] }

const { listBoroughs } = require("../../lib/pilotAreas");

module.exports = function mountAdminPilotAreasGet(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get(
    "/admin/pilot-areas",
    auth,
    requireAdmin(ctx),
    async (_req, res) => {
      try {
        const boroughs = await listBoroughs(mysqlQuery);
        return res.status(200).json({ boroughs });
      } catch (err) {
        ctx.log?.error?.(
          { err: err?.message },
          "[GET /api/admin/pilot-areas] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );
};
