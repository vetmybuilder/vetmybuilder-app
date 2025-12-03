// server/routes/notifications/read-all.post.js
/**
 * POST /api/notifications/read-all
 * Auth: required
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post("/notifications/read-all", auth, async (req, res) => {
    try {
      // Use NOW() so we don't have to worry about JS datetime formatting
      await mysqlQuery(
        `UPDATE notifications
            SET readAt = NOW()
          WHERE userId = ?
            AND readAt IS NULL`,
        [req.user.uid]
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error("Error marking all notifications as read in MySQL:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};

// // server/routes/notifications/read-all.post.js
// /**
//  * POST /api/notifications/read-all
//  * Auth: required
//  * Response: { ok: true }
//  */
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;

//   router.post("/notifications/read-all", auth, (req, res) => {
//     db.prepare(
//       `UPDATE notifications
//           SET readAt = ?
//         WHERE userId = ? AND readAt IS NULL`
//     ).run(new Date().toISOString(), req.user.uid);

//     return res.json({ ok: true });
//   });
// };
