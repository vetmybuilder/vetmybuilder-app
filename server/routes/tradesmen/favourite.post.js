// server/routes/tradesmen/favourite.post.js
/**
 * Favourites API for tradesmen
 *
 * POST   /api/tradesmen/:id/favourite    -> add current user favourite
 * DELETE /api/tradesmen/:id/favourite    -> remove favourite
 *
 * Auth: required (homeowner or any logged-in user)
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  // Helper to normalise builderId
  function normaliseBuilderId(raw) {
    if (!raw) return null;
    return String(raw).trim();
  }

  router.post("/tradesmen/:id/favourite", auth, (req, res) => {
    try {
      const userId = req.user && req.user.uid;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const builderId = normaliseBuilderId(req.params.id);
      if (!builderId) {
        return res.status(400).json({ error: "Invalid tradesman id" });
      }

      // Ensure table exists (back-compat)
      db.exec(`
        CREATE TABLE IF NOT EXISTS favourite_tradesmen (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          builderId TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          UNIQUE (userId, builderId)
        );
      `);

      const now = new Date().toISOString();

      db.prepare(
        `INSERT OR IGNORE INTO favourite_tradesmen (userId, builderId, createdAt)
         VALUES (?, ?, ?)`
      ).run(userId, builderId, now);

      return res.status(200).json({ ok: true, favourited: true });
    } catch (err) {
      console.error("[favourite-tradesmen] POST error", err);
      return res
        .status(500)
        .json({ error: "Failed to save favourite tradesman" });
    }
  });

  router.delete("/tradesmen/:id/favourite", auth, (req, res) => {
    try {
      const userId = req.user && req.user.uid;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const builderId = normaliseBuilderId(req.params.id);
      if (!builderId) {
        return res.status(400).json({ error: "Invalid tradesman id" });
      }

      // Table may or may not exist yet; if not, nothing to delete.
      try {
        db.prepare(
          `DELETE FROM favourite_tradesmen WHERE userId = ? AND builderId = ?`
        ).run(userId, builderId);
      } catch (e) {
        console.warn(
          "[favourite-tradesmen] DELETE: table missing or other error",
          e.message || e
        );
      }

      return res.status(200).json({ ok: true, favourited: false });
    } catch (err) {
      console.error("[favourite-tradesmen] DELETE error", err);
      return res
        .status(500)
        .json({ error: "Failed to remove favourite tradesman" });
    }
  });
};
