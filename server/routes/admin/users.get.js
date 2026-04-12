// server/routes/admin/users.get.js
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get("/admin/users", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.users.list" });

    try {
      res.set("Cache-Control", "no-store");

      const q = String(req.query.q || "").trim().toLowerCase();
      const roleFilter = String(req.query.role || "").trim().toLowerCase();
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
      const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

      const wh = [];
      const params = [];

      if (q) {
        wh.push(`(LOWER(u.firstName) LIKE ? OR LOWER(u.lastName) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(t.company_name) LIKE ?)`);
        const like = `%${q}%`;
        params.push(like, like, like, like);
      }

      if (roleFilter && ["user", "tradesman", "admin"].includes(roleFilter)) {
        wh.push(`ur.role = ?`);
        params.push(roleFilter);
      }

      const whereSql = wh.length > 0 ? `WHERE ${wh.join(" AND ")}` : "";

      const countRows = await mysqlQuery(
        `SELECT COUNT(*) AS c
         FROM users u
         LEFT JOIN user_roles ur ON ur.uid = u.uid
         LEFT JOIN tradesmen t ON t.user_id = u.uid
         ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.c || 0);

      const rows = await mysqlQuery(
        `SELECT
           u.uid, u.email, u.firstName, u.lastName,
           u.locationRaw, u.postcodeOutward, u.createdAt,
           COALESCE(ur.role, 'user') AS role,
           t.company_name, t.trade_types, t.service_areas, t.status AS tradesmanStatus
         FROM users u
         LEFT JOIN user_roles ur ON ur.uid = u.uid
         LEFT JOIN tradesmen t ON t.user_id = u.uid
         ${whereSql}
         ORDER BY u.createdAt DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );

      const items = rows.map((r) => ({
        uid: r.uid,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        location: r.postcodeOutward || r.locationRaw || null,
        role: r.role || "user",
        createdAt: r.createdAt,
        tradesman: r.company_name
          ? {
              companyName: r.company_name,
              tradeTypes: r.trade_types || "",
              serviceAreas: r.service_areas || "",
              status: r.tradesmanStatus || "draft",
            }
          : null,
      }));

      log.info({ total, returned: items.length }, "admin users list");
      return res.json({ items, total });
    } catch (err) {
      log.error({ err: err?.message }, "admin users list failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
