// server/v2/routes/projects/archive.post.js
/**
 * POST /api/v2/projects/:id/archive
 * Auth: required (owner only)
 * Response: { project }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.post("/projects/:id/archive", auth, (req, res) => {
    const uid = req.user.uid;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const current = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!current) return res.status(404).json({ error: "Not found" });
    if (String(current.ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    db.prepare(`UPDATE projects SET status='archived' WHERE id=?`).run(id);
    const updated = db.prepare(`SELECT * FROM projects WHERE id=?`).get(id);
    return res.json({ project: updated });
  });
};
