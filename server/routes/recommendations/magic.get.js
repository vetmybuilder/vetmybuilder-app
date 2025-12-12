// server/routes/recommendations/magic.get.js

/**
 * GET /api/recommendations/magic/:token
 * Auth: none
 * - 404 if token not found
 * - 400 if project not live
 * Response: { token, project: { id, name } }
 */
module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[recommendations.magic.get]";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  router.get("/recommendations/magic/:token", async (req, res) => {
    const { token } = req.params || {};

    log.info?.(`${TAG} start`, { token });

    try {
      if (!token) {
        log.warn?.(`${TAG} missing token`);
        return res.status(400).json({ error: "token_required" });
      }

      const rows = await mysqlQuery(
        `
        SELECT
          rl.*,
          p.name   AS projectName,
          p.id     AS projectId,
          p.status AS projectStatus
        FROM recommendation_links rl
        JOIN projects p
          ON p.id = rl.projectId
        WHERE rl.token = ?
        LIMIT 1
        `,
        [token]
      );

      const row = rows?.[0] || null;

      if (!row) {
        log.warn?.(`${TAG} invalid token`, { token });
        return res.status(404).json({ error: "Invalid link" });
      }

      const status = String(row.projectStatus || "").toLowerCase();
      if (status !== "live") {
        log.warn?.(`${TAG} project not live`, {
          token,
          projectId: row.projectId,
          status,
        });
        return res.status(400).json({
          error: "This project is not accepting recommendations yet.",
        });
      }

      log.info?.(`${TAG} ok`, {
        token,
        projectId: row.projectId,
        projectName: row.projectName,
      });

      return res.json({
        token,
        project: { id: row.projectId, name: row.projectName },
      });
    } catch (e) {
      log.error?.(`${TAG} error`, e);
      return res.status(500).json({
        error: "FAILED",
        message: e?.message || String(e),
      });
    }
  });
};
