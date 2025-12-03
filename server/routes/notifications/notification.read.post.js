// server/routes/notifications/notification.read.post.js
/**
 * POST /api/notifications/:id/read
 * Auth: required
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post("/notifications/:id/read", auth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    try {
      // Check notification belongs to this user
      const rows = await mysqlQuery(
        `SELECT userId
           FROM notifications
          WHERE id = ?`,
        [id]
      );

      const row = rows[0];
      if (!row || String(row.userId) !== String(req.user.uid)) {
        return res.status(404).json({ error: "Not found" });
      }

      // Mark as read (use NOW() so we don't care about JS → MySQL datetime format)
      await mysqlQuery(
        `UPDATE notifications
            SET readAt = NOW()
          WHERE id = ?`,
        [id]
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error("Error marking notification as read in MySQL:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};

// // server/routes/notifications/notification.read.post.js
// /**
//  * POST /api/notifications/:id/read
//  * Auth: required
//  * Response: { ok: true }
//  */
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;

//   router.post("/notifications/:id/read", auth, (req, res) => {
//     const id = Number(req.params.id);
//     if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

//     const row = db
//       .prepare(`SELECT userId FROM notifications WHERE id = ?`)
//       .get(id);

//     if (!row || String(row.userId) !== String(req.user.uid)) {
//       return res.status(404).json({ error: "Not found" });
//     }

//     db.prepare(`UPDATE notifications SET readAt = ? WHERE id = ?`).run(
//       new Date().toISOString(),
//       id
//     );
//     return res.json({ ok: true });
//   });
// };
