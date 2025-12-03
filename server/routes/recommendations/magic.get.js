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
  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  router.get("/recommendations/magic/:token", async (req, res) => {
    try {
      const { token } = req.params || {};
      if (!token) {
        return res.status(400).json({ error: "token_required" });
      }

      const rows = await mysqlQuery(
        `
        SELECT
          rl.*,
          p.name  AS projectName,
          p.id    AS projectId,
          p.status AS projectStatus
        FROM recommendation_links rl
        JOIN projects p
          ON p.id = rl.projectId
        WHERE rl.token = ?
        LIMIT 1
      `,
        [token]
      );

      const row = rows && rows[0] ? rows[0] : null;

      if (!row) {
        return res.status(404).json({ error: "Invalid link" });
      }

      if (String(row.projectStatus || "").toLowerCase() !== "live") {
        return res.status(400).json({
          error: "This project is not accepting recommendations yet.",
        });
      }

      return res.json({
        token,
        project: { id: row.projectId, name: row.projectName },
      });
    } catch (e) {
      console.error("[GET /recommendations/magic/:token] error", e);
      return res.status(500).json({
        error: "FAILED",
        message: e?.message || String(e),
      });
    }
  });
};

// // server/routes/recommendations/magic.get.js
// /**
//  * GET /api/recommendations/magic/:token
//  * Auth: none
//  * - 404 if token not found
//  * - 400 if project not live
//  * Response: { token, project: { id, name } }
//  */
// module.exports = (router, ctx) => {
//   const { db } = ctx;

//   router.get("/recommendations/magic/:token", (req, res) => {
//     const { token } = req.params;

//     const row = db
//       .prepare(
//         `SELECT rl.*, p.name AS projectName, p.id AS projectId, p.status AS projectStatus
//            FROM recommendation_links rl
//            JOIN projects p ON p.id = rl.projectId
//           WHERE rl.token = ?`
//       )
//       .get(token);

//     if (!row) return res.status(404).json({ error: "Invalid link" });

//     if (String(row.projectStatus || "").toLowerCase() !== "live") {
//       return res.status(400).json({
//         error: "This project is not accepting recommendations yet.",
//       });
//     }

//     return res.json({
//       token,
//       project: { id: row.projectId, name: row.projectName },
//     });
//   });
// };
