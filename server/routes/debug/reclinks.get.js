// server/routes/debug/reclinks.get.js
/**
 * GET /api/debug/reclinks/:projectId
 * Auth: required (owner only)
 * Response: { rows: Array<{ id, token, createdAt }> }
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { db, auth, mysqlQuery } = ctx;

  router.get("/debug/reclinks/:projectId", auth, async (req, res) => {
    const log = withRequest(req).child({ route: "debug.reclinks" });

    let projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      log.warn({ projectId: req.params.projectId }, "Invalid projectId");
      return res.status(400).json({ error: "bad id" });
    }

    try {
      // --- Fetch project owner ---
      let ownerRow;

      if (mysqlQuery) {
        const rows = await mysqlQuery(
          `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
          [projectId]
        );
        ownerRow = rows[0] || null;
      } else if (db) {
        ownerRow = db
          .prepare(`SELECT ownerUserId FROM projects WHERE id = ?`)
          .get(projectId);
      }

      if (!ownerRow) {
        log.warn({ projectId }, "Project not found");
        return res.status(404).json({ error: "not found" });
      }

      if (String(ownerRow.ownerUserId) !== String(req.user.uid)) {
        log.warn(
          { projectId, owner: ownerRow.ownerUserId, requester: req.user.uid },
          "Forbidden — requester is not owner"
        );
        return res.status(403).json({ error: "forbidden" });
      }

      // --- Fetch recommendation link rows ---
      let rows = [];

      if (mysqlQuery) {
        rows = await mysqlQuery(
          `
          SELECT id, token, createdAt
          FROM recommendation_links
          WHERE projectId = ?
        `,
          [projectId]
        );
      } else if (db) {
        rows = db
          .prepare(
            `SELECT id, token, createdAt
               FROM recommendation_links
              WHERE projectId = ?`
          )
          .all(projectId);
      }

      log.info(
        { projectId, count: rows.length },
        "Loaded recommendation links"
      );

      return res.json({ rows });
    } catch (err) {
      log.error(
        {
          projectId,
          errMsg: err?.message,
          stack: err?.stack,
        },
        "Failed loading recommendation links"
      );

      return res.status(500).json({ error: "internal_error" });
    }
  });
};
