// server/routes/admin/demand-signals.get.js
//
// GET /api/admin/demand-signals
//
// Admin-only. Aggregates rows from category_demand_signals so the pilot
// project-types admin page can show "X taps / Y opted-in" next to each
// category and inform launch-priority decisions.
//
// Response shape:
//   { byCategory: [
//       { category, totalTaps, optedInCount, lastTapAt },
//       ...
//     ],
//     recentOptIns: [
//       { category, email, postcode, createdAt },
//       ...
//     ]
//   }

module.exports = function mountAdminDemandSignalsGet(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get(
    "/admin/demand-signals",
    auth,
    requireAdmin(ctx),
    async (_req, res) => {
      try {
        // Self-bootstrap so this endpoint works on fresh installs even
        // before anyone has tapped a "Coming soon" tile.
        await mysqlQuery(
          `CREATE TABLE IF NOT EXISTS category_demand_signals (
             id INT AUTO_INCREMENT PRIMARY KEY,
             category VARCHAR(100) NOT NULL,
             user_uid VARCHAR(128) NULL,
             email VARCHAR(255) NULL,
             postcode VARCHAR(20) NULL,
             notify_when_live TINYINT(1) NOT NULL DEFAULT 0,
             created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             KEY idx_category_demand_signals_category (category),
             KEY idx_category_demand_signals_created_at (created_at)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        );

        const byCategory = await mysqlQuery(
          `SELECT category,
                  COUNT(*) AS totalTaps,
                  SUM(notify_when_live) AS optedInCount,
                  MAX(created_at) AS lastTapAt
             FROM category_demand_signals
            GROUP BY category
            ORDER BY totalTaps DESC, category ASC`,
        );

        const recentOptIns = await mysqlQuery(
          `SELECT category, email, postcode, created_at AS createdAt
             FROM category_demand_signals
            WHERE notify_when_live = 1
            ORDER BY created_at DESC
            LIMIT 50`,
        );

        return res.status(200).json({
          byCategory: byCategory.map((r) => ({
            category: r.category,
            totalTaps: Number(r.totalTaps) || 0,
            optedInCount: Number(r.optedInCount) || 0,
            lastTapAt: r.lastTapAt,
          })),
          recentOptIns,
        });
      } catch (err) {
        ctx.log?.error?.(
          { err: err?.message },
          "[GET /api/admin/demand-signals] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );
};
