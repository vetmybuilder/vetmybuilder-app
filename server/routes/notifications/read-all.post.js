// server/v2/routes/notifications/read-all.post.js
/**
 * POST /api/v2/notifications/read-all
 * Auth: required
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.post("/notifications/read-all", auth, (req, res) => {
    db.prepare(
      `UPDATE notifications
          SET readAt = ?
        WHERE userId = ? AND readAt IS NULL`
    ).run(new Date().toISOString(), req.user.uid);

    return res.json({ ok: true });
  });
};
