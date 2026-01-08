// server/routes/debug/trades-role.get.js
/**
 * GET {API_PREFIX}/debug/trades-role
 * Auth: required
 * Helps verify what the server sees for your current session.
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  const BASE = (ctx.API_PREFIX || "/api").replace(/\/+$/, "");
  const at = (p) => `${BASE}${p.startsWith("/") ? p : `/${p}`}`;

  router.get(at("/debug/trades-role"), auth, async (req, res) => {
    const log = withRequest(req).child({ route: "debug/trades-role" });

    const uid = req.user?.uid || null;
    const email = req.user?.email || null;

    if (!uid) {
      log.warn("Unauthorized request — missing uid");
      return res.status(401).json({ error: "Unauthorized" });
    }

    async function loadRoleAndTradesman() {
      // --- Role lookup ---
      let roleRow = null;
      try {
        const rows = await mysqlQuery(
          `SELECT role FROM user_roles WHERE uid = ?`,
          [uid]
        );
        roleRow = rows[0] || null;
      } catch (e) {
        log.error(
          { errMsg: e?.message, stack: e?.stack },
          "Error loading user role"
        );
        throw e;
      }

      // --- Load tradesman row for this UID ---
      let tRow = null;
      try {
        const tRows = await mysqlQuery(
          `SELECT user_id,
                  company_name,
                  status,
                  subscription_status,
                  contact_credits,
                  trade_types,
                  service_areas,
                  email,
                  created_at,
                  updated_at
             FROM tradesmen
            WHERE user_id = ?`,
          [uid]
        );
        tRow = tRows[0] || null;
      } catch (e) {
        log.error(
          { errMsg: e?.message, stack: e?.stack },
          "Error loading direct tradesman row"
        );
        throw e;
      }

      // --- Auto-link lead_* rows when direct row missing ---
      if (!tRow && email) {
        const normalisedEmail = String(email).trim().toLowerCase();
        log.info({ email: normalisedEmail }, "Attempting lead auto-link");

        try {
          const leadRows = await mysqlQuery(
            `SELECT user_id
               FROM tradesmen
              WHERE user_id LIKE 'lead_%'
                AND LOWER(COALESCE(email,'')) = ?
              ORDER BY COALESCE(updated_at, created_at) DESC
              LIMIT 1`,
            [normalisedEmail]
          );

          const lead = leadRows[0] || null;

          if (lead) {
            log.info(
              { leadId: lead.user_id, uid },
              "Auto-linking lead_* row → real UID"
            );

            // Update lead_* record to real UID
            await mysqlQuery(
              `UPDATE tradesmen
                  SET user_id = ?, updated_at = NOW()
                WHERE user_id = ?`,
              [uid, lead.user_id]
            );

            // Ensure role is tradesman
            await mysqlQuery(
              `INSERT INTO user_roles (uid, role)
               VALUES (?, 'tradesman')
               ON DUPLICATE KEY UPDATE role = VALUES(role)`,
              [uid]
            );

            // Reload updated row
            const tRows2 = await mysqlQuery(
              `SELECT user_id,
                      company_name,
                      status,
                      subscription_status,
                      contact_credits,
                      trade_types,
                      service_areas,
                      email,
                      created_at,
                      updated_at
                 FROM tradesmen
                WHERE user_id = ?`,
              [uid]
            );
            tRow = tRows2[0] || null;
          } else {
            log.info("No lead row found matching email");
          }
        } catch (e) {
          log.error(
            { errMsg: e?.message, stack: e?.stack },
            "Error during lead auto-link logic"
          );
          throw e;
        }
      }

      const role = String(roleRow?.role || "user").toLowerCase();
      return { role, tradesman: tRow };
    }

    try {
      const { role, tradesman } = await loadRoleAndTradesman();

      log.info(
        {
          uid,
          role,
          hasTradesman: !!tradesman,
        },
        "Resolved debug/trades-role"
      );

      return res.json({
        uid,
        email,
        role,
        tradesman,
      });
    } catch (err) {
      log.error(
        { errMsg: err?.message, stack: err?.stack },
        "debug/trades-role failed"
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
