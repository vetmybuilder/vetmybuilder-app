// server/routes/projects/archive.post.js
/**
 * POST /api/projects/:id/archive
 * Auth: required (owner only)
 * Response: { project }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // Structured logger (same pattern used across upgraded routes)
  const { logger, withRequest } = require("../../lib/logger");

  router.post("/projects/:id/archive", auth, async (req, res) => {
    const uid = req.user?.uid;
    const projectId = Number(req.params.id);

    const log = withRequest(req, logger).child({
      route: "/projects/:id/archive",
      action: "archive_project",
      uid,
      projectId,
    });

    if (!Number.isFinite(projectId)) {
      log.warn("Invalid projectId");
      return res.status(400).json({ error: "Invalid id" });
    }

    // ------------------------------
    // Fetch current project
    // ------------------------------
    let current;
    try {
      const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        projectId,
      ]);
      current = rows[0] || null;
    } catch (err) {
      log.error(
        { error: err?.message, stack: err?.stack },
        "MySQL error fetching project"
      );
      return res.status(500).json({ error: "internal_error" });
    }

    if (!current) {
      log.info("Project not found");
      return res.status(404).json({ error: "Not found" });
    }

    if (String(current.ownerUserId) !== String(uid)) {
      log.warn(
        { ownerUserId: current.ownerUserId },
        "Forbidden — user is not project owner"
      );
      return res.status(403).json({ error: "Forbidden" });
    }

    // ------------------------------
    // Archive project
    // ------------------------------
    try {
      await mysqlQuery(
        `UPDATE projects SET status='archived', updatedAt = NOW() WHERE id = ?`,
        [projectId]
      );

      const updatedRows = await mysqlQuery(
        `SELECT * FROM projects WHERE id = ?`,
        [projectId]
      );
      const project = updatedRows[0] || null;

      log.info({ newStatus: project?.status }, "Project archived successfully");

      res.json({ project });
      ctx.logActivity("project.archive", "info", req.user.uid, `Project #${projectId} archived`);
      return;
    } catch (err) {
      log.error(
        { error: err?.message, stack: err?.stack },
        "MySQL error archiving project"
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
