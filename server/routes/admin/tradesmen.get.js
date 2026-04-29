// server/routes/admin/tradesmen.get.js

/**
 * GET /api/admin/tradesmen?q=&status=all|draft|active|inactive&page=1&pageSize=20
 * Auth: admin
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx");
  }

  if (!ctx.__logged_admin_tradesmen_get) {
    ctx.__logged_admin_tradesmen_get = true;
    logger.info(
      { route: "/admin/tradesmen" },
      "Mounted admin tradesmen GET route"
    );
  }

  router.get("/admin/tradesmen", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.tradesmen.list" });

    try {
      res.set("Cache-Control", "no-store");

      const q = String(req.query.q || "")
        .trim()
        .toLowerCase();

      const status = String(req.query.status || "all").toLowerCase();
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(String(req.query.pageSize || "20"), 10))
      );
      const offset = (page - 1) * pageSize;

      log.info(
        { q, status, page, pageSize, offset },
        "Admin tradesmen list query parameters"
      );

      const parts = [];
      const params = [];

      if (status !== "all") {
        parts.push(`t.status = ?`);
        params.push(status);
      }

      if (q) {
        parts.push(`(
          LOWER(t.company_name) LIKE CONCAT('%', ?, '%')
          OR LOWER(t.email)     LIKE CONCAT('%', ?, '%')
          OR LOWER(u.email)     LIKE CONCAT('%', ?, '%')
        )`);
        params.push(q, q, q);
      }

      const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";

      log.debug({ where, params }, "Generated SQL WHERE clause");

      // ---- total count ----
      const countRows = await mysqlQuery(
        `
        SELECT COUNT(*) AS c
        FROM tradesmen t
        LEFT JOIN users u ON u.uid = t.user_id
        ${where}
        `,
        params
      );

      const total = Number(countRows?.[0]?.c || 0);

      // ---- fetch rows ----
      // Also LEFT JOIN the most recent active builder_subscriptions row
      // so the admin UI can show the live tier + expiry per tradesman.
      const rows = await mysqlQuery(
        `
        SELECT
          t.user_id,
          t.company_name,
          t.email AS company_email,
          t.status,
          t.subscription_status,
          t.plan,
          t.purchased_plan,
          t.service_areas,
          t.trade_types,
          t.created_at,
          t.updated_at,
          u.email     AS user_email,
          u.firstName,
          u.lastName,

          -- live subscription tier + expiry (NULL if not subscribed)
          bs.tier_id              AS subscriptionTierId,
          bs.status               AS subscriptionRowStatus,
          bs.current_period_end   AS subscriptionPeriodEnd,

          -- unresolved flags count
          (
            SELECT COUNT(1)
            FROM tradesmen_flags f
            WHERE f.user_id = t.user_id AND f.resolved = 0
          ) AS openFlags,

          -- approved unlocks
          (
            SELECT COUNT(*)
            FROM project_contact_unlocks uo
            WHERE uo.buyer_uid = t.user_id
              AND LOWER(COALESCE(uo.status,'')) = 'approved'
          ) AS unlocksApproved,

          -- pending unlocks
          (
            SELECT COUNT(*)
            FROM project_contact_unlocks uo
            WHERE uo.buyer_uid = t.user_id
              AND LOWER(COALESCE(uo.status,'')) IN ('pending','pending_admin')
          ) AS unlocksPending

        FROM tradesmen t
        LEFT JOIN users u ON u.uid = t.user_id
        LEFT JOIN builder_subscriptions bs
          ON bs.user_id = t.user_id
         AND bs.status = 'active'
         AND bs.current_period_end > NOW()
        ${where}
        ORDER BY t.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
        `,
        params
      );

      log.info(
        { total, returned: rows.length, page, pageSize },
        "Returning admin tradesmen list"
      );

      res.json({
        items: rows,
        total,
        page,
        pageSize,
      });
    } catch (e) {
      log.error(
        { err: e?.message, stack: e?.stack },
        "Error loading admin tradesmen list"
      );

      res.status(500).json({ error: "Internal error loading tradesmen list" });
    }
  });
};
