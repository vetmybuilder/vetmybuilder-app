// server/routes/admin/projects.delete.js
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.delete("/admin/projects/:id", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.projects.delete" });
    const id = parseInt(req.params.id, 10);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    try {
      const rows = await mysqlQuery("SELECT id, name FROM projects WHERE id = ?", [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      const projectName = rows[0].name;

      // Clean up related data
      const cleanup = [
        "DELETE FROM recommendations WHERE projectId = ?",
        "DELETE FROM hires WHERE projectId = ?",
        "DELETE FROM notifications WHERE projectId = ?",
        "DELETE FROM project_classifications WHERE project_id = ?",
        "DELETE FROM match_observations WHERE project_id = ?",
      ];
      for (const sql of cleanup) {
        try { await mysqlQuery(sql, [id]); } catch (e) {
          log.warn({ err: e?.message, sql }, "cleanup query failed (non-fatal)");
        }
      }

      await mysqlQuery("DELETE FROM projects WHERE id = ?", [id]);

      log.info({ projectId: id, projectName }, "admin deleted project");
      ctx.logActivity?.("admin.project.delete", "info", req.user?.uid, `Project deleted: #${id} ${projectName}`);
      return res.json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message, id }, "admin project delete failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
