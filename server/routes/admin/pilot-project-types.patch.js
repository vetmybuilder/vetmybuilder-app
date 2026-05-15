// server/routes/admin/pilot-project-types.patch.js
//
// Two admin-only endpoints for toggling pilot project-type rows:
//
//   PATCH /api/admin/pilot-project-types/:typeName      - single leaf toggle
//   PATCH /api/admin/pilot-project-types/category/:category  - bulk-toggle every leaf
//
// Body for both: { enabled: boolean }
//
// 404 when the path name doesn't match an entry in the canonical catalog
// (server/lib/matching/projectTradeMap.js TYPE_TO_CATEGORY). On success,
// the in-process cache is invalidated so the next /api/pilot/project-types
// read reflects the change.

const {
  setTypeEnabled,
  setCategoryEnabled,
} = require("../../lib/pilotProjectTypes");

module.exports = function mountAdminPilotProjectTypesPatch(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  // Bulk-toggle every leaf inside a category. Registered FIRST so the
  // /category/:category prefix beats the catch-all /:typeName route below
  // (Express matches in declaration order).
  router.patch(
    "/admin/pilot-project-types/category/:category",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const category = decodeURIComponent(req.params.category || "").trim();
      const enabled = !!req.body?.enabled;

      if (!category) {
        return res.status(400).json({ error: "missing_category" });
      }

      try {
        await setCategoryEnabled(mysqlQuery, category, enabled);
        return res.status(200).json({ ok: true, category, enabled });
      } catch (err) {
        if (err?.code === "unknown_category") {
          return res.status(404).json({ error: "unknown_category" });
        }
        ctx.log?.error?.(
          { err: err?.message, category },
          "[PATCH /api/admin/pilot-project-types/category] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );

  router.patch(
    "/admin/pilot-project-types/:typeName",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const typeName = decodeURIComponent(req.params.typeName || "").trim();
      const enabled = !!req.body?.enabled;

      if (!typeName) {
        return res.status(400).json({ error: "missing_type_name" });
      }

      try {
        await setTypeEnabled(mysqlQuery, typeName, enabled);
        return res.status(200).json({ ok: true, typeName, enabled });
      } catch (err) {
        if (err?.code === "unknown_project_type") {
          return res.status(404).json({ error: "unknown_project_type" });
        }
        ctx.log?.error?.(
          { err: err?.message, typeName },
          "[PATCH /api/admin/pilot-project-types] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );
};
