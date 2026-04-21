/**
 * GET /api/admin/feedback
 * Auth: admin only
 * Returns all feedback entries, newest first.
 */
module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const log = ctx.log || console;

  router.get("/admin/feedback", auth, async (req, res) => {
    try {
      const rows = await mysqlQuery(
        `SELECT f.*, u.firstName, u.lastName, u.email
         FROM feedback f
         LEFT JOIN users u ON u.uid = f.user_id
         ORDER BY f.created_at DESC
         LIMIT 200`
      );
      res.json({ items: rows });
    } catch (err) {
      log.error?.({ err: err?.message }, "[admin/feedback] fetch failed");
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });
};
