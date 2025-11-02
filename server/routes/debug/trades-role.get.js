// server/routes/debug/trades-role.get.js
/**
 * GET {API_PREFIX}/debug/trades-role
 * Auth: required
 * Helps verify what the server sees for your current session.
 */
module.exports = (router, ctx) => {
  const { auth } = ctx;
  const BASE = (ctx.API_PREFIX || "/api").replace(/\/+$/, "");
  const at = (p) => `${BASE}${p.startsWith("/") ? p : `/${p}`}`;

  router.get(at("/debug/trades-role"), auth, (req, res) => {
    const uid = req.user?.uid || null;
    const email = req.user?.email || null;

    // Do the same resolution the guards use (will also trigger auto-linking)
    const { requireTradesman } = require("../../lib/roles"); // only to access its helpers indirectly
    const load = require("../../lib/roles"); // not exported, so re-run via guards path
    // Reuse the same logic:
    const { role, tradesman } = (function loadRoleAndTradesman() {
      const roleRow =
        ctx.db.prepare(`SELECT role FROM user_roles WHERE uid=?`).get(uid) ||
        null;

      let tRow =
        ctx.db
          .prepare(
            `SELECT user_id, company_name, status, subscription_status,
                    contact_credits, trade_types, service_areas, email,
                    created_at, updated_at
               FROM tradesmen
              WHERE user_id = ?`
          )
          .get(uid) || null;

      if (!tRow && email) {
        // inline lightweight auto-link attempt
        const em = String(email).trim().toLowerCase();
        const lead = ctx.db
          .prepare(
            `SELECT user_id
               FROM tradesmen
              WHERE user_id LIKE 'lead_%' AND LOWER(COALESCE(email,'')) = ?
              ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
              LIMIT 1`
          )
          .get(em);

        if (lead) {
          const tx = ctx.db.transaction(() => {
            ctx.db
              .prepare(
                `UPDATE tradesmen SET user_id=?, updated_at=datetime('now') WHERE user_id=?`
              )
              .run(uid, lead.user_id);
            ctx.db
              .prepare(
                `INSERT INTO user_roles (uid, role) VALUES (?, 'tradesman')
                 ON CONFLICT(uid) DO UPDATE SET role='tradesman'`
              )
              .run(uid);
          });
          tx();

          tRow =
            ctx.db
              .prepare(
                `SELECT user_id, company_name, status, subscription_status,
                        contact_credits, trade_types, service_areas, email,
                        created_at, updated_at
                   FROM tradesmen
                  WHERE user_id = ?`
              )
              .get(uid) || null;
        }
      }

      const r = String(roleRow?.role || "user").toLowerCase();
      return { role: r, tradesman: tRow };
    })();

    res.json({ uid, email, role, tradesman });
  });
};
