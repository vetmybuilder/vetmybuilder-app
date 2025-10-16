// server/v2/routes/debug/reclinks.get.js
/**
 * GET /api/v2/debug/reclinks/:projectId   (also /api/debug/reclinks/:projectId if mounted)
 * Auth: required (owner only)
 * Response: { rows: Array<{ id, token, createdAt }> }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.get("/debug/reclinks/:projectId", auth, (req, res) => {
    const pid = Number(req.params.projectId);
    if (!Number.isFinite(pid)) {
      return res.status(400).json({ error: "bad id" });
    }

    const p = db
      .prepare(`SELECT ownerUserId FROM projects WHERE id = ?`)
      .get(pid);

    if (!p) return res.status(404).json({ error: "not found" });
    if (String(p.ownerUserId) !== String(req.user.uid)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const rows = db
      .prepare(
        `SELECT id, token, createdAt
           FROM recommendation_links
          WHERE projectId = ?`
      )
      .all(pid);

    return res.json({ rows });
  });
};
