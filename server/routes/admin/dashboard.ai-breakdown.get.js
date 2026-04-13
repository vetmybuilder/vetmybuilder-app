// server/routes/admin/dashboard.ai-breakdown.get.js
const { withRequest } = require("../../lib/logger");
const { requireAdmin } = require("../../lib/roles");

const RANGE_MAP = {
  "24h": "1 DAY",
  "7d": "7 DAY",
  "14d": "14 DAY",
  "30d": "30 DAY",
};

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.get("/admin/dashboard/ai-breakdown", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.dashboard.ai-breakdown" });
    const range = RANGE_MAP[req.query.range] || RANGE_MAP["7d"];

    try {
      const rows = await mysqlQuery(
        `SELECT feature,
                COUNT(*)                       AS count,
                COALESCE(SUM(cost_pence), 0)   AS total_pence,
                ROUND(AVG(latency_ms))         AS avg_latency_ms
         FROM ai_inference_log
         WHERE created_at >= NOW() - INTERVAL ${range}
         GROUP BY feature
         ORDER BY total_pence DESC`,
      );

      res.json({
        items: rows.map((r) => ({
          feature: r.feature,
          count: Number(r.count),
          totalPence: Number(r.total_pence),
          avgLatencyMs: Number(r.avg_latency_ms || 0),
        })),
      });
    } catch (err) {
      log.error({ error: err?.message }, "Dashboard AI breakdown query failed");
      res.status(500).json({ error: "internal_error" });
    }
  });
};
