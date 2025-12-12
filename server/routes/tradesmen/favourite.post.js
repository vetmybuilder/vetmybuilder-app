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
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/favourite]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  function normaliseBuilderId(raw) {
    if (!raw) return null;
    return String(raw).trim();
  }

  async function ensureFavouriteTable() {
    log.info?.(`${TAG} ensure favourite_tradesmen table`);
    await mysqlQuery(`
      CREATE TABLE IF NOT EXISTS favourite_tradesmen (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId     VARCHAR(191) NOT NULL,
        builderId  VARCHAR(191) NOT NULL,
        createdAt  DATETIME NOT NULL,
        UNIQUE KEY uniq_user_builder (userId, builderId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  router.post("/tradesmen/:id/favourite", auth, async (req, res) => {
    log.info?.(`${TAG} POST start`, { builderId: req.params.id });

    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const builderId = normaliseBuilderId(req.params.id);
      if (!builderId)
        return res.status(400).json({ error: "Invalid tradesman id" });

      await ensureFavouriteTable();
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await mysqlQuery(
        `
        INSERT IGNORE INTO favourite_tradesmen (userId, builderId, createdAt)
        VALUES (?, ?, ?)
        `,
        [userId, builderId, now]
      );

      log.info?.(`${TAG} favourited`, { userId, builderId });
      return res.status(200).json({ ok: true, favourited: true });
    } catch (err) {
      log.error?.(`${TAG} POST error`, { error: err?.message });
      return res
        .status(500)
        .json({ error: "Failed to save favourite tradesman" });
    }
  });

  router.delete("/tradesmen/:id/favourite", auth, async (req, res) => {
    log.info?.(`${TAG} DELETE start`, { builderId: req.params.id });

    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const builderId = normaliseBuilderId(req.params.id);
      if (!builderId)
        return res.status(400).json({ error: "Invalid tradesman id" });

      try {
        await ensureFavouriteTable();
        await mysqlQuery(
          `
          DELETE FROM favourite_tradesmen
           WHERE userId = ?
             AND builderId = ?
          `,
          [userId, builderId]
        );
      } catch (e) {
        log.warn?.(`${TAG} DELETE table missing or error`, {
          error: e?.message,
        });
      }

      log.info?.(`${TAG} unfavourited`, { userId, builderId });
      return res.status(200).json({ ok: true, favourited: false });
    } catch (err) {
      log.error?.(`${TAG} DELETE error`, { error: err?.message });
      return res
        .status(500)
        .json({ error: "Failed to remove favourite tradesman" });
    }
  });
};
