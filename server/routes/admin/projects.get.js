// server/routes/admin/projects.get.js
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get("/admin/projects", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.projects.list" });

    try {
      const q = String(req.query.q || "").trim().toLowerCase();
      const statusFilter = String(req.query.status || "").trim().toLowerCase();
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
      const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

      const wh = [];
      const params = [];

      if (q) {
        wh.push(`(LOWER(p.name) LIKE ? OR LOWER(p.type) LIKE ? OR LOWER(p.location) LIKE ?)`);
        const like = `%${q}%`;
        params.push(like, like, like);
      }

      if (statusFilter && statusFilter !== "all") {
        wh.push(`p.status = ?`);
        params.push(statusFilter);
      }

      const whereSql = wh.length > 0 ? `WHERE ${wh.join(" AND ")}` : "";

      const countRows = await mysqlQuery(
        `SELECT COUNT(*) AS c FROM projects p ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.c || 0);

      const rows = await mysqlQuery(
        `SELECT
           p.id, p.name, p.type, p.location, p.status,
           p.ownerUserId, p.createdAt, p.propertyType, p.bedrooms,
           u.firstName AS ownerFirstName, u.lastName AS ownerLastName, u.email AS ownerEmail
         FROM projects p
         LEFT JOIN users u ON u.uid = p.ownerUserId
         ${whereSql}
         ORDER BY p.createdAt DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );

      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        location: r.location,
        status: r.status,
        propertyType: r.propertyType || null,
        bedrooms: r.bedrooms || null,
        ownerUserId: r.ownerUserId,
        ownerName: [r.ownerFirstName, r.ownerLastName].filter(Boolean).join(" ") || r.ownerEmail || r.ownerUserId,
        ownerEmail: r.ownerEmail || null,
        createdAt: r.createdAt,
      }));

      log.info({ total, returned: items.length }, "admin projects list");
      return res.json({ items, total });
    } catch (err) {
      log.error({ err: err?.message }, "admin projects list failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
