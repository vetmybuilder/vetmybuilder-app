// server/v2/routes/projects/unfavourite.post.js
/**
 * POST /api/v2/projects/:id/unfavourite
 * Auth: required
 * Body: none
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.post("/projects/:id/unfavourite", auth, (req, res) => {
    const uid = req.user.uid;
    const pid = Number(req.params.id);
    if (!Number.isFinite(pid)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    db.prepare(`DELETE FROM favourites WHERE userId = ? AND projectId = ?`).run(
      uid,
      pid
    );

    return res.json({ ok: true });
  });
};
