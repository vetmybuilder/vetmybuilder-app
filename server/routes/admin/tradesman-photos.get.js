// server/routes/admin/tradesman-photos.get.js
//
// GET /api/admin/tradesmen/:uid/photos
// Admin-only. Returns the portfolio photos for one tradesman, ordered
// the same way the public profile renders them (sort_order ASC, then
// oldest first as a stable tiebreaker).
//
// Mirrors tradesman-docs.get on purpose - the admin drawer's PhotosTab
// uses the same lazy-load pattern as the Docs tab so we don't bloat
// the leaderboard list response with URLs for every row.
//
// Response shape:
//   { photos: [{ id, url, sortOrder, createdAt }] }

const { requireAdmin } = require("../../lib/roles");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");
  const log = ctx.log || console;
  const TAG = "[admin/tradesman-photos.get]";
  const adminGuard = requireAdmin(ctx);

  router.get(
    "/admin/tradesmen/:uid/photos",
    auth,
    adminGuard,
    async (req, res) => {
      const uid = String(req.params.uid || "").trim();
      if (!uid) {
        return res.status(400).json({ ok: false, error: "missing_uid" });
      }

      try {
        const rows = await mysqlQuery(
          `SELECT id, url, sort_order AS sortOrder, created_at AS createdAt
             FROM tradesmen_photos
            WHERE tradesman_user_id = ?
            ORDER BY COALESCE(sort_order, 999999), created_at ASC, id ASC`,
          [uid],
        );

        return res.json({
          photos: (rows || []).map((r) => ({
            id: Number(r.id),
            url: r.url || null,
            sortOrder:
              r.sortOrder === null || r.sortOrder === undefined
                ? null
                : Number(r.sortOrder),
            createdAt: r.createdAt || null,
          })),
        });
      } catch (err) {
        log.error?.(`${TAG} failed`, {
          error: err?.message,
          uid,
        });
        return res.status(500).json({ ok: false, error: "fetch_failed" });
      }
    },
  );

  if (!ctx.__logged_admin_tradesman_photos) {
    ctx.__logged_admin_tradesman_photos = true;
    log.info?.(`[routes] mounted: /admin/tradesmen/:uid/photos`);
  }
};
