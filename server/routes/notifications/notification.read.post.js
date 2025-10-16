// server/v2/routes/notifications/notification.read.post.js
/**
 * POST /api/v2/notifications/:id/read
 * Auth: required
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.post("/notifications/:id/read", auth, (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const row = db
      .prepare(`SELECT userId FROM notifications WHERE id = ?`)
      .get(id);

    if (!row || String(row.userId) !== String(req.user.uid)) {
      return res.status(404).json({ error: "Not found" });
    }

    db.prepare(`UPDATE notifications SET readAt = ? WHERE id = ?`).run(
      new Date().toISOString(),
      id
    );
    return res.json({ ok: true });
  });
};
