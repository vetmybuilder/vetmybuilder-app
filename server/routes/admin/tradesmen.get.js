/**
 * GET /api/admin/tradesmen?q=&status=all|draft|active|inactive&page=1&pageSize=20
 * Auth: admin
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  console.log("[routes] mounted: GET /admin/tradesmen");

  // Ensure base tables exist (defensive)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tradesmen (
      user_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT, phone TEXT, email TEXT,
      trade_types TEXT DEFAULT '', service_areas TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      subscription_status TEXT DEFAULT 'free',
      contact_credits INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft'
    )
  `).run();

  router.get("/admin/tradesmen", auth, requireAdmin(ctx), (req, res) => {
    res.set("Cache-Control", "no-store");

    const q = String(req.query.q || "").trim().toLowerCase();
    const status = String(req.query.status || "all").toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "20"), 10)));
    const offset = (page - 1) * pageSize;

    const parts = [];
    const params = [];

    if (status !== "all") { parts.push(`t.status = ?`); params.push(status); }
    if (q) {
      parts.push(`(
        LOWER(t.company_name) LIKE '%' || ? || '%'
        OR LOWER(t.email)       LIKE '%' || ? || '%'
        OR LOWER(u.email)       LIKE '%' || ? || '%'
      )`);
      params.push(q, q, q);
    }

    const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";

    const countRow = db.prepare(`
      SELECT COUNT(*) AS c
      FROM tradesmen t
      LEFT JOIN users u ON u.uid = t.user_id
      ${where}
    `).get(...params);

    const rows = db.prepare(`
      SELECT
        t.user_id,
        t.company_name,
        t.email AS company_email,
        t.status,
        t.subscription_status,
        t.service_areas,
        t.trade_types,
        t.created_at,
        t.updated_at,
        u.email AS user_email,
        u.firstName, u.lastName,
        (
          SELECT COUNT(1) FROM tradesmen_flags f
          WHERE f.user_id = t.user_id AND f.resolved = 0
        ) AS openFlags
      FROM tradesmen t
      LEFT JOIN users u ON u.uid = t.user_id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    res.json({ items: rows, total: countRow.c, page, pageSize });
  });
};
