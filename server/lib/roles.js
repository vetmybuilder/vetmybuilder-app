// server/lib/roles.js

/**
 * Role + tradesman loader + guards.
 */

module.exports = { requireTradesman, requireActiveTradesman, requireAdmin };

const TAG = "[roles]";

/* ============================================================
   AUTO-LINK HELPERS (MySQL + SQLite)
   ============================================================ */

async function tryAutoLinkLeadByEmail(ctx, uid, email) {
  const log = ctx.log || console;
  const em = String(email || "")
    .trim()
    .toLowerCase();
  if (!uid || !em) return false;

  const { mysqlQuery, db } = ctx;

  /* ---------- MySQL path ---------- */
  if (mysqlQuery) {
    try {
      const rows = await mysqlQuery(
        `
        SELECT user_id
          FROM tradesmen
         WHERE user_id LIKE 'lead_%'
           AND LOWER(COALESCE(email,'')) = ?
         ORDER BY COALESCE(updated_at, created_at) DESC
         LIMIT 1
        `,
        [em]
      );
      const lead = rows[0] || null;
      if (!lead) return false;

      await mysqlQuery(
        `
        UPDATE tradesmen
           SET user_id = ?, updated_at = NOW()
         WHERE user_id = ?
        `,
        [uid, lead.user_id]
      );

      await mysqlQuery(
        `
        INSERT INTO user_roles (uid, role)
        VALUES (?, 'tradesman')
        ON DUPLICATE KEY UPDATE role = VALUES(role)
        `,
        [uid]
      );

      log.info(`${TAG} auto-linked tradesman (MySQL)`, {
        from: lead.user_id,
        to: uid,
        email: em,
      });
      return true;
    } catch (e) {
      log.warn(`${TAG} tryAutoLinkLeadByEmail MySQL error`, {
        error: e?.message || e,
      });
      return false;
    }
  }

  /* ---------- SQLite fallback ---------- */
  if (db && db.prepare) {
    try {
      const lead =
        db
          .prepare(
            `
            SELECT user_id
              FROM tradesmen
             WHERE user_id LIKE 'lead_%'
               AND LOWER(COALESCE(email,'')) = ?
             ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
             LIMIT 1
          `
          )
          .get(em) || null;

      if (!lead) return false;

      const tx = db.transaction(() => {
        db.prepare(
          `UPDATE tradesmen
             SET user_id = ?, updated_at = datetime('now')
           WHERE user_id = ?`
        ).run(uid, lead.user_id);

        db.prepare(
          `INSERT INTO user_roles (uid, role)
             VALUES (?, 'tradesman')
           ON CONFLICT(uid) DO UPDATE SET role='tradesman'`
        ).run(uid);
      });
      tx();

      log.info(`${TAG} auto-linked tradesman (SQLite)`, {
        from: lead.user_id,
        to: uid,
        email: em,
      });

      return true;
    } catch (e) {
      log.warn(`${TAG} tryAutoLinkLeadByEmail SQLite error`, {
        error: e?.message || e,
      });
      return false;
    }
  }

  return false;
}

/* ============================================================
   LOAD ROLE + TRADESMAN ROW
   ============================================================ */

async function loadRoleAndTradesman(ctx, uid, emailOpt) {
  const log = ctx.log || console;
  const { mysqlQuery, db } = ctx;

  /* ---------- MySQL path ---------- */
  if (mysqlQuery) {
    let roleRow = null;
    let tRow = null;

    try {
      const rows = await mysqlQuery(
        `SELECT role FROM user_roles WHERE uid = ? LIMIT 1`,
        [uid]
      );
      roleRow = rows[0] || null;
    } catch {
      // no logging needed
    }

    try {
      const tRows = await mysqlQuery(
        `
        SELECT user_id, company_name, status, subscription_status,
               contact_credits, trade_types, service_areas, email,
               created_at, updated_at
          FROM tradesmen
         WHERE user_id = ?
         LIMIT 1
        `,
        [uid]
      );
      tRow = tRows[0] || null;
    } catch {
      tRow = null;
    }

    /* Auto-link lead_* → real user */
    if (!tRow && emailOpt) {
      const linked = await tryAutoLinkLeadByEmail(ctx, uid, emailOpt);
      if (linked) {
        try {
          const tRows2 = await mysqlQuery(
            `
            SELECT user_id, company_name, status, subscription_status,
                   contact_credits, trade_types, service_areas, email,
                   created_at, updated_at
              FROM tradesmen
             WHERE user_id = ?
             LIMIT 1
            `,
            [uid]
          );
          tRow = tRows2[0] || null;
        } catch {
          tRow = null;
        }
      }
    }

    const role = String(roleRow?.role || "user").toLowerCase();
    return { role, tradesman: tRow };
  }

  /* ---------- SQLite fallback ---------- */
  if (db && db.prepare) {
    const roleRow =
      db.prepare(`SELECT role FROM user_roles WHERE uid=?`).get(uid) || null;

    let tRow =
      db
        .prepare(
          `SELECT user_id, company_name, status, subscription_status,
                  contact_credits, trade_types, service_areas, email,
                  created_at, updated_at
             FROM tradesmen
            WHERE user_id = ?`
        )
        .get(uid) || null;

    if (!tRow && emailOpt) {
      const linked = await tryAutoLinkLeadByEmail(ctx, uid, emailOpt);
      if (linked) {
        tRow =
          db
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

    const role = String(roleRow?.role || "user").toLowerCase();
    return { role, tradesman: tRow };
  }

  /* ---------- No DB ---------- */
  return { role: "user", tradesman: null };
}

/* ============================================================
   MIDDLEWARE GUARDS
   ============================================================ */

function requireTradesman(ctx) {
  const log = ctx.log || console;

  return async (req, res, next) => {
    try {
      const uid = req.user?.uid;
      const email = String(req.user?.email || "");

      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const { role, tradesman } = await loadRoleAndTradesman(ctx, uid, email);

      req.userRole = role;
      req.tradesman = tradesman;

      log.info(`${TAG} requireTradesman`, {
        uid,
        role,
        hasProfile: !!tradesman,
        status: tradesman?.status || "n/a",
      });

      if (role !== "tradesman" && !tradesman) {
        return res
          .status(403)
          .json({ error: "Tradesman access required", code: "NO_PROFILE" });
      }

      next();
    } catch (e) {
      log.error(`${TAG} requireTradesman error`, {
        error: e?.message || e,
      });
      res.status(500).json({ error: "Role check failed" });
    }
  };
}

function requireActiveTradesman(ctx) {
  const log = ctx.log || console;

  return async (req, res, next) => {
    try {
      const uid = req.user?.uid;
      const email = String(req.user?.email || "");

      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const { role, tradesman } = await loadRoleAndTradesman(ctx, uid, email);

      req.userRole = role;
      req.tradesman = tradesman;

      log.info(`${TAG} requireActiveTradesman`, {
        uid,
        role,
        hasProfile: !!tradesman,
        status: tradesman?.status || "n/a",
      });

      if (!tradesman) {
        return res
          .status(403)
          .json({ error: "Tradesman profile required", code: "NO_PROFILE" });
      }

      if (String(tradesman.status || "").toLowerCase() !== "active") {
        return res.status(403).json({
          error: "Tradesman not active",
          code: "NOT_ACTIVE",
          status: tradesman.status || "unknown",
        });
      }

      next();
    } catch (e) {
      log.error(`${TAG} requireActiveTradesman error`, {
        error: e?.message || e,
      });
      res.status(500).json({ error: "Role check failed" });
    }
  };
}

function requireAdmin(ctx) {
  const log = ctx.log || console;

  const allowlist = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return async (req, res, next) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const email = String(req.user?.email || "").toLowerCase();
      const { role } = await loadRoleAndTradesman(ctx, uid, email);

      const isAdminRole = role === "admin";
      const isAllowlisted = email && allowlist.includes(email);

      log.info(`${TAG} requireAdmin`, {
        uid,
        role,
        allowlisted: isAllowlisted,
      });

      if (!isAdminRole && !isAllowlisted) {
        return res.status(403).json({ error: "Admin access required" });
      }

      next();
    } catch (e) {
      log.error(`${TAG} requireAdmin error`, {
        error: e?.message || e,
      });
      res.status(500).json({ error: "Role check failed" });
    }
  };
}
