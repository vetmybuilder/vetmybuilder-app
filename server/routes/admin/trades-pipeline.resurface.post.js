/**
 * POST /api/admin/trades-pipeline/resurface
 * Auth: admin only
 * Re-runs surfacing on all live projects so newly approved pipeline
 * entries appear on existing projects.
 */
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");
  const { surfacePipelineTradespeople } = require("../../lib/surfacePipelineTradespeople");
  const { broadcastNotification } = require("../../lib/sse");

  router.post("/admin/trades-pipeline/resurface", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.trades-pipeline.resurface" });

    try {
      const projects = await mysqlQuery(
        "SELECT id, name, type, location, ownerUserId FROM projects WHERE status = 'live'"
      );

      if (projects.length === 0) {
        return res.json({ ok: true, projects: 0, surfaced: 0, message: "No live projects" });
      }

      let totalSurfaced = 0;
      let projectsUpdated = 0;

      for (const p of projects) {
        try {
          const before = await mysqlQuery(
            "SELECT COUNT(*) AS cnt FROM recommendations WHERE projectId = ? AND source = 'pipeline'",
            [p.id]
          );
          const beforeCount = before[0]?.cnt || 0;

          await surfacePipelineTradespeople({
            mysqlQuery,
            projectId: p.id,
            projectType: p.type,
            projectName: p.name,
            projectLocation: p.location,
            broadcastNotification,
            logActivity: ctx.logActivity,
          });

          const after = await mysqlQuery(
            "SELECT COUNT(*) AS cnt FROM recommendations WHERE projectId = ? AND source = 'pipeline'",
            [p.id]
          );
          const afterCount = after[0]?.cnt || 0;
          const added = afterCount - beforeCount;

          if (added > 0) {
            totalSurfaced += added;
            projectsUpdated++;
            log.info({ projectId: p.id, name: p.name, added }, "[resurface] surfaced new entries");
          }
        } catch (err) {
          log.warn({ projectId: p.id, err: err?.message }, "[resurface] failed for project (continuing)");
        }
      }

      log.info({ projects: projects.length, projectsUpdated, totalSurfaced }, "[resurface] complete");
      ctx.logActivity?.("admin.pipeline.resurface", "info", req.user?.uid, `Resurfaced: ${totalSurfaced} across ${projectsUpdated} projects`);

      res.json({
        ok: true,
        projects: projects.length,
        projectsUpdated,
        surfaced: totalSurfaced,
      });
    } catch (err) {
      log.error({ err: err?.message }, "[resurface] failed");
      res.status(500).json({ error: "Failed to resurface" });
    }
  });
};
