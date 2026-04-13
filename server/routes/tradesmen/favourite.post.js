// server/routes/tradesmen/favourite.post.js
/**
 * Favourites API for tradesmen
 *
 * POST   /api/tradesmen/:id/favourite    -> add favourite (idempotent)
 * DELETE /api/tradesmen/:id/favourite    -> remove favourite (idempotent)
 *
 * Auth: required
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/favourite]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  function normaliseBuilderId(raw) {
    const id = String(raw || "").trim();
    if (!id) return null;
    if (id.length > 191) return null;
    return id;
  }

  router.post("/tradesmen/:id/favourite", auth, async (req, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const builderId = normaliseBuilderId(req.params.id);
      if (!builderId) {
        return res.status(400).json({ error: "Invalid tradesman id" });
      }

      await mysqlQuery(
        `
        INSERT IGNORE INTO favourite_tradesmen (userId, builderId)
        VALUES (?, ?)
        `,
        [userId, builderId],
      );

      log.info?.(`${TAG} favourited`, { userId, builderId });
      res.status(200).json({ ok: true, favourited: true });
      ctx.logActivity("tradesman.favourite", "info", req.user?.uid || "guest", "Favourited tradesman");
      return;
    } catch (err) {
      log.error?.(`${TAG} POST error`, { error: err?.message || err });
      return res
        .status(500)
        .json({ error: "Failed to save favourite tradesman" });
    }
  });

  router.delete("/tradesmen/:id/favourite", auth, async (req, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const builderId = normaliseBuilderId(req.params.id);
      if (!builderId) {
        return res.status(400).json({ error: "Invalid tradesman id" });
      }

      await mysqlQuery(
        `
        DELETE FROM favourite_tradesmen
         WHERE userId = ?
           AND builderId = ?
        `,
        [userId, builderId],
      );

      log.info?.(`${TAG} unfavourited`, { userId, builderId });
      res.status(200).json({ ok: true, favourited: false });
      ctx.logActivity("tradesman.unfavourite", "info", req.user?.uid || "guest", "Unfavourited tradesman");
      return;
    } catch (err) {
      log.error?.(`${TAG} DELETE error`, { error: err?.message || err });
      return res
        .status(500)
        .json({ error: "Failed to remove favourite tradesman" });
    }
  });
};
