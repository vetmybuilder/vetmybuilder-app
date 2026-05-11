// server/routes/admin/pilot-areas.patch.js
//
// PATCH /api/admin/pilot-areas/:name
// Body: { enabled: boolean }
//
// Admin-only. Toggles the `enabled` flag for a single borough. The borough
// name in the path must match an entry in the static borough catalog
// (server/lib/boroughPostcodes.js); otherwise we 404.
//
// Side effects:
//   - Writes the new value to pilot_boroughs.
//   - Invalidates the in-process cache so the next /api/pilot/areas read
//     reflects the change immediately.

const { setBoroughEnabled } = require("../../lib/pilotAreas");

module.exports = function mountAdminPilotAreasPatch(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.patch(
    "/admin/pilot-areas/:name",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const name = decodeURIComponent(req.params.name || "").trim();
      const enabled = !!req.body?.enabled;

      if (!name) {
        return res.status(400).json({ error: "missing_name" });
      }

      try {
        await setBoroughEnabled(mysqlQuery, name, enabled);
        return res.status(200).json({ ok: true, name, enabled });
      } catch (err) {
        if (err?.code === "unknown_borough") {
          return res.status(404).json({ error: "unknown_borough" });
        }
        ctx.log?.error?.(
          { err: err?.message, name },
          "[PATCH /api/admin/pilot-areas] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );
};
