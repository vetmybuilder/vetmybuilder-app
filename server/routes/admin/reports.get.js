// server/routes/admin/reports.get.js
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get("/admin/reports", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.reports.list" });

    try {
      const status = String(req.query.status || "open").toLowerCase();
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
      const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

      const wh = [];
      const params = [];

      if (status !== "all") {
        wh.push("r.status = ?");
        params.push(status);
      }

      const whereSql = wh.length > 0 ? `WHERE ${wh.join(" AND ")}` : "";

      const countRows = await mysqlQuery(
        `SELECT COUNT(*) AS c FROM reports r ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.c || 0);

      const rows = await mysqlQuery(
        `SELECT r.*, u.email AS reporter_email, u.firstName AS reporter_name
         FROM reports r
         LEFT JOIN users u ON u.uid = r.reporter_uid
         ${whereSql}
         ORDER BY r.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );

      log.info({ total, returned: rows.length, status }, "admin reports list");
      return res.json({ items: rows, total });
    } catch (err) {
      log.error({ err: err?.message }, "admin reports list failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
