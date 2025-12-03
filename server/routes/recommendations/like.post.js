// server/routes/recommendations/like.post.js

/**
 * POST /api/recommendations/:id/like
 * Auth: required
 * Effect: one like per user (INSERT IGNORE semantics)
 * Response: { ok: true, recommendationId, likes, myLike }
 */
module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post("/recommendations/:id/like", auth, async (req, res) => {
    try {
      const userId = req.user.uid;
      const recId = Number(req.params.id);

      if (!Number.isFinite(recId)) {
        return res.status(400).json({ error: "Bad id" });
      }

      // Ensure recommendation exists
      const recRows = await mysqlQuery(
        `SELECT id, projectId
           FROM recommendations
          WHERE id = ?
          LIMIT 1`,
        [recId]
      );
      const rec = recRows[0];
      if (!rec) {
        return res.status(404).json({ error: "Recommendation not found" });
      }

      // Load project + owner to prevent owner from liking
      const projRows = await mysqlQuery(
        `SELECT ownerUserId
           FROM projects
          WHERE id = ?
          LIMIT 1`,
        [rec.projectId]
      );
      const proj = projRows[0];
      if (!proj) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (String(proj.ownerUserId) === String(userId)) {
        return res.status(403).json({ error: "Owner cannot like" });
      }

      // One like per user: rely on a UNIQUE(recommendationId,userId) constraint if present
      // INSERT IGNORE gives us the same behaviour as SQLite's INSERT OR IGNORE
      await mysqlQuery(
        `INSERT IGNORE INTO recommendation_votes (recommendationId, userId, value)
         VALUES (?, ?, 1)`,
        [recId, userId]
      );

      // Total likes for this recommendation
      const likeCountRows = await mysqlQuery(
        `SELECT COUNT(*) AS likes
           FROM recommendation_votes
          WHERE recommendationId = ? AND value = 1`,
        [recId]
      );
      const likes = Number(likeCountRows[0]?.likes || 0);

      // Whether THIS user has liked it
      const myLikeRows = await mysqlQuery(
        `SELECT 1
           FROM recommendation_votes
          WHERE recommendationId = ? AND userId = ? AND value = 1
          LIMIT 1`,
        [recId, userId]
      );
      const myLike = myLikeRows.length > 0;

      return res.json({
        ok: true,
        recommendationId: recId,
        likes,
        myLike,
      });
    } catch (err) {
      console.error("[recommendations.like.post] error:", err);
      return res.status(500).json({ error: "Internal error toggling like" });
    }
  });
};

// // server/routes/recommendations/like.post.js
// /**
//  * POST /api/recommendations/:id/like
//  * Auth: required
//  * Effect: one like per user (INSERT OR IGNORE)
//  * Response: { ok: true, recommendationId, likes, myLike }
//  */
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;

//   router.post("/recommendations/:id/like", auth, (req, res) => {
//     const userId = req.user.uid;
//     const recId = Number(req.params.id);
//     if (!Number.isFinite(recId)) {
//       return res.status(400).json({ error: "Bad id" });
//     }

//     const rec = db
//       .prepare(`SELECT id, projectId FROM recommendations WHERE id = ?`)
//       .get(recId);
//     if (!rec)
//       return res.status(404).json({ error: "Recommendation not found" });

//     const proj = db
//       .prepare(`SELECT ownerUserId FROM projects WHERE id = ?`)
//       .get(rec.projectId);
//     if (!proj) return res.status(404).json({ error: "Project not found" });
//     if (String(proj.ownerUserId) === String(userId)) {
//       return res.status(403).json({ error: "Owner cannot like" });
//     }

//     db.prepare(
//       `INSERT OR IGNORE INTO recommendation_votes (recommendationId, userId, value)
//        VALUES (?, ?, 1)`
//     ).run(recId, userId);

//     const row = db
//       .prepare(
//         `SELECT COUNT(*) AS likes
//            FROM recommendation_votes
//           WHERE recommendationId = ? AND value = 1`
//       )
//       .get(recId);

//     const myLike = !!db
//       .prepare(
//         `SELECT 1 FROM recommendation_votes
//           WHERE recommendationId = ? AND userId = ? LIMIT 1`
//       )
//       .get(recId, userId);

//     return res.json({
//       ok: true,
//       recommendationId: recId,
//       likes: row.likes || 0,
//       myLike,
//     });
//   });
// };
