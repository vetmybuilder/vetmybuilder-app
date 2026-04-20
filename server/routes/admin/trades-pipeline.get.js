const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get("/admin/trades-pipeline", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.trades-pipeline.list" });

    try {
      const q = String(req.query.q || "").trim().toLowerCase();
      const statusFilter = String(req.query.status || "").trim().toLowerCase();
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10)));
      const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

      const wh = [];
      const params = [];

      if (q) {
        wh.push("(LOWER(company_name) LIKE ? OR LOWER(trade_types) LIKE ?)");
        params.push(`%${q}%`, `%${q}%`);
      }

      const tradeFilter = String(req.query.trade || "").trim();
      if (tradeFilter) {
        wh.push("LOWER(trade_types) LIKE ?");
        params.push(`%${tradeFilter.toLowerCase()}%`);
      }

      if (statusFilter && statusFilter !== "all") {
        wh.push("status = ?");
        params.push(statusFilter);
      }

      const whereSql = wh.length > 0 ? `WHERE ${wh.join(" AND ")}` : "";

      const countRows = await mysqlQuery(
        `SELECT COUNT(*) AS c FROM tradesperson_pipeline ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.c || 0);

      const rows = await mysqlQuery(
        `SELECT * FROM tradesperson_pipeline ${whereSql}
         ORDER BY discovered_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );

      log.info({ total, returned: rows.length }, "trades pipeline list");
      return res.json({ items: rows, total });
    } catch (err) {
      log.error({ err: err?.message }, "trades pipeline list failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
