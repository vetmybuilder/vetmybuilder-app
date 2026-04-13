// server/routes/admin/dashboard.activity.get.js
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

  router.get("/admin/dashboard/activity", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.dashboard.activity" });
    const range = RANGE_MAP[req.query.range] || RANGE_MAP["7d"];
    const level = req.query.level || "all";
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    try {
      const levelClause = level === "all" ? "" : "AND level = ?";
      const params = level === "all" ? [] : [level];

      const rows = await mysqlQuery(
        `SELECT id, event, level, actor_uid, detail, created_at
         FROM activity_log
         WHERE created_at >= NOW() - INTERVAL ${range}
           ${levelClause}
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        params,
      );

      res.json({
        items: rows.map((r) => ({
          id: r.id,
          event: r.event,
          level: r.level,
          actorUid: r.actor_uid,
          detail: r.detail,
          createdAt: r.created_at,
        })),
      });
    } catch (err) {
      log.error({ error: err?.message }, "Dashboard activity query failed");
      res.status(500).json({ error: "internal_error" });
    }
  });
};
