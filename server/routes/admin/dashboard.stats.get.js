// server/routes/admin/dashboard.stats.get.js
const { withRequest } = require("../../lib/logger");
const { requireAdmin } = require("../../lib/roles");
const { activeSseCount } = require("../../lib/sse");

const RANGE_MAP = {
  "24h": "1 DAY",
  "7d": "7 DAY",
  "14d": "14 DAY",
  "30d": "30 DAY",
};

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.get("/admin/dashboard/stats", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.dashboard.stats" });
    const range = RANGE_MAP[req.query.range] || RANGE_MAP["7d"];
    const rangeKey = req.query.range || "7d";

    try {
      const [aiRows] = await Promise.all([
        mysqlQuery(
          `SELECT COUNT(*) AS count, COALESCE(SUM(cost_pence), 0) AS total_pence
           FROM ai_inference_log WHERE created_at >= NOW() - INTERVAL ${range}`,
        ),
      ]);

      const googleRows = await mysqlQuery(
        `SELECT COUNT(*) AS count, COALESCE(SUM(cost_pence), 0) AS total_pence
         FROM ai_inference_log WHERE feature = 'googleEnricher' AND created_at >= NOW() - INTERVAL ${range}`,
      );

      const notifRows = await mysqlQuery(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) AS failed
         FROM activity_log
         WHERE event LIKE 'notify.%' AND created_at >= NOW() - INTERVAL ${range}`,
      );

      res.json({
        range: rangeKey,
        ai: {
          count: Number(aiRows[0]?.count || 0),
          costPence: Number(aiRows[0]?.total_pence || 0),
        },
        google: {
          count: Number(googleRows[0]?.count || 0),
          costPence: Number(googleRows[0]?.total_pence || 0),
        },
        notifications: {
          total: Number(notifRows[0]?.total || 0),
          failed: Number(notifRows[0]?.failed || 0),
        },
        sseLive: activeSseCount(),
      });
    } catch (err) {
      log.error({ error: err?.message }, "Dashboard stats query failed");
      res.status(500).json({ error: "internal_error" });
    }
  });
};
