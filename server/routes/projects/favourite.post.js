// server/v2/routes/projects/favourite.post.js
/**
 * POST /api/v2/projects/:id/favourite
 * Auth: required
 * - 400 invalid id
 * - 404 if project not found
 * - 400 if trying to favourite your own project
 * - idempotent: INSERT OR IGNORE
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.post("/projects/:id/favourite", auth, (req, res) => {
    const uid = req.user.uid;
    const pid = Number(req.params.id);
    if (!Number.isFinite(pid)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const project = db
      .prepare(`SELECT id, ownerUserId FROM projects WHERE id = ?`)
      .get(pid);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (String(project.ownerUserId) === String(uid)) {
      return res
        .status(400)
        .json({ error: "You cannot favourite your own project." });
    }

    db.prepare(
      `INSERT OR IGNORE INTO favourites (userId, projectId) VALUES (?, ?)`
    ).run(uid, pid);

    return res.json({ ok: true });
  });
};
