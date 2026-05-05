// server/routes/recommendations/unfavourite.post.js
//
// POST /api/recommendations/:id/unfavourite
// Owner-only. Sets homeowner_unfavourited_at = NOW() so the rec card is
// removed from both the swipe deck and favourites.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post("/recommendations/:id/unfavourite", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const recId = Number(req.params.id);
    if (!Number.isFinite(recId) || recId <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    try {
      const rows = await mysqlQuery(
        `SELECT p.ownerUserId
           FROM recommendations r
           JOIN projects p ON p.id = r.projectId
          WHERE r.id = ?
          LIMIT 1`,
        [recId],
      );
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Recommendation not found" });
      if (String(row.ownerUserId) !== String(uid)) {
        return res.status(403).json({ error: "Not your project" });
      }

      await mysqlQuery(
        `UPDATE recommendations SET homeowner_unfavourited_at = NOW() WHERE id = ?`,
        [recId],
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error("[unfavourite] error:", e?.message);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
