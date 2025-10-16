// server/v2/routes/recommendations/magic.get.js
/**
 * GET /api/v2/recommendations/magic/:token
 * Auth: none
 * - 404 if token not found
 * - 400 if project not live
 * Response: { token, project: { id, name } }
 */
module.exports = (router, ctx) => {
  const { db } = ctx;

  router.get("/recommendations/magic/:token", (req, res) => {
    const { token } = req.params;

    const row = db
      .prepare(
        `SELECT rl.*, p.name AS projectName, p.id AS projectId, p.status AS projectStatus
           FROM recommendation_links rl
           JOIN projects p ON p.id = rl.projectId
          WHERE rl.token = ?`
      )
      .get(token);

    if (!row) return res.status(404).json({ error: "Invalid link" });

    if (String(row.projectStatus || "").toLowerCase() !== "live") {
      return res.status(400).json({
        error: "This project is not accepting recommendations yet.",
      });
    }

    return res.json({
      token,
      project: { id: row.projectId, name: row.projectName },
    });
  });
};
