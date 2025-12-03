// server/routes/projects/unarchive.post.js
/**
 * POST /api/projects/:id/unarchive
 * Auth: required (owner only)
 * Effect: sets status -> 'pending'
 * Response: { project }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post("/projects/:id/unarchive", auth, async (req, res) => {
    const uid = req.user.uid;
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    // Fetch current project
    let currentRows;
    try {
      currentRows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        id,
      ]);
    } catch (err) {
      console.error("MySQL fetch error (unarchive):", err);
      return res.status(500).json({ error: "internal_error" });
    }

    const current = currentRows[0] || null;
    if (!current) return res.status(404).json({ error: "Not found" });

    if (String(current.ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Unarchive it → to pending
    try {
      await mysqlQuery(`UPDATE projects SET status='pending' WHERE id = ?`, [
        id,
      ]);

      const updatedRows = await mysqlQuery(
        `SELECT * FROM projects WHERE id = ?`,
        [id]
      );
      return res.json({ project: updatedRows[0] });
    } catch (err) {
      console.error("MySQL update error (unarchive):", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};

// // server/routes/projects/unarchive.post.js
// /**
//  * POST /api/projects/:id/unarchive
//  * Auth: required (owner only)
//  * Effect: sets status -> 'pending'
//  * Response: { project }
//  */
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;

//   router.post("/projects/:id/unarchive", auth, (req, res) => {
//     const uid = req.user.uid;
//     const id = Number(req.params.id);
//     if (!Number.isFinite(id)) {
//       return res.status(400).json({ error: "Invalid id" });
//     }

//     const current = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
//     if (!current) return res.status(404).json({ error: "Not found" });
//     if (String(current.ownerUserId) !== String(uid)) {
//       return res.status(403).json({ error: "Forbidden" });
//     }

//     // Move it out of Archive, back into My Projects as "pending"
//     db.prepare(`UPDATE projects SET status = 'pending' WHERE id = ?`).run(id);

//     const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
//     return res.json({ project: updated });
//   });
// };
