/**
 * POST /api/admin/tradesmen/:uid/flag
 * Body: { reason: string, severity?: "info"|"warn"|"block" }
 * Auth: admin
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  console.log("[routes] mounted: POST /admin/tradesmen/:uid/flag");

  router.post(
    "/admin/tradesmen/:uid/flag",
    auth,
    requireAdmin(ctx),
    (req, res) => {
      const uid = String(req.params.uid || "");
      const reason = String(req.body?.reason || "").trim();
      const severity = ["info", "warn", "block"].includes(
        String(req.body?.severity || "warn")
      )
        ? String(req.body.severity || "warn")
        : "warn";

      if (!uid) return res.status(400).json({ error: "uid required" });
      if (!reason) return res.status(400).json({ error: "reason required" });

      const exists = db
        .prepare(`SELECT 1 FROM tradesmen WHERE user_id=?`)
        .get(uid);
      if (!exists)
        return res.status(404).json({ error: "tradesman not found" });

      const info = db
        .prepare(
          `
      INSERT INTO tradesmen_flags (user_id, created_by, reason, severity)
      VALUES (?, ?, ?, ?)
    `
        )
        .run(uid, req.user.uid, reason, severity);

      const flag = db
        .prepare(`SELECT * FROM tradesmen_flags WHERE id=?`)
        .get(info.lastInsertRowid);
      return res.status(201).json({ ok: true, flag });
    }
  );
};
