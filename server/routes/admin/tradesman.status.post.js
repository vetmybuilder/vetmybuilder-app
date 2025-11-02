/**
 * POST /api/admin/tradesmen/:uid/status
 * Body: { status: "draft"|"active"|"inactive" }
 * Auth: admin
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  console.log("[routes] mounted: POST /admin/tradesmen/:uid/status");

  router.post(
    "/admin/tradesmen/:uid/status",
    auth,
    requireAdmin(ctx),
    (req, res) => {
      const uid = String(req.params.uid || "");
      const status = String(req.body?.status || "").toLowerCase();

      if (!uid) return res.status(400).json({ error: "uid required" });
      if (!["draft", "active", "inactive"].includes(status)) {
        return res.status(400).json({ error: "invalid status" });
      }

      const exists = db
        .prepare(`SELECT 1 FROM tradesmen WHERE user_id=?`)
        .get(uid);
      if (!exists)
        return res.status(404).json({ error: "tradesman not found" });

      db.prepare(
        `
      UPDATE tradesmen
      SET status = ?,
          subscription_status = CASE WHEN ?='active' THEN 'active' ELSE subscription_status END,
          updated_at = datetime('now')
      WHERE user_id = ?
    `
      ).run(status, status, uid);

      const row = db
        .prepare(`SELECT * FROM tradesmen WHERE user_id=?`)
        .get(uid);
      return res.json({ ok: true, tradesman: row });
    }
  );
};
