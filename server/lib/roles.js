// server/lib/roles.js

/**
 * Attaches role + tradesman row to the request if present:
 *   req.userRole       -> "admin" | "tradesman" | "user" (fallback)
 *   req.tradesman      -> { user_id, status, company_name, ... } | null
 *
 * Guards:
 *   requireTradesman(ctx)         -> role === "tradesman" OR has profile (any status)
 *   requireActiveTradesman(ctx)   -> same, but tradesman.status must be "active"
 *   requireAdmin(ctx)             -> user_roles.role === "admin" OR email allowlisted
 *
 * First-touch auto-link:
 *   If no tradesman row for uid, but a lead_* row exists with matching email,
 *   migrate that row to user_id = uid and set user_roles.role = 'tradesman'.
 */

const TAG = "[roles]";

/* ---------- auto-link helpers (MySQL + SQLite) ---------- */

async function tryAutoLinkLeadByEmail(ctx, uid, email) {
  const em = String(email || "")
    .trim()
    .toLowerCase();
  if (!uid || !em) return false;

  const { mysqlQuery, db } = ctx;

  // ---- MySQL path ----
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

      // Rebind lead_* -> real uid
      await mysqlQuery(
        `
        UPDATE tradesmen
           SET user_id = ?, updated_at = NOW()
         WHERE user_id = ?
        `,
        [uid, lead.user_id]
      );

      // Ensure role row (ON DUPLICATE KEY behaves like SQLite's ON CONFLICT)
      await mysqlQuery(
        `
        INSERT INTO user_roles (uid, role)
        VALUES (?, 'tradesman')
        ON DUPLICATE KEY UPDATE role = VALUES(role)
        `,
        [uid]
      );

      console.log(
        `${TAG} auto-linked tradesman (MySQL): lead ${lead.user_id} -> uid ${uid} (email=${em})`
      );
      return true;
    } catch (e) {
      console.warn(
        `${TAG} tryAutoLinkLeadByEmail MySQL error:`,
        e?.message || e
      );
      return false;
    }
  }

  // ---- SQLite / better-sqlite3 fallback ----
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
          `INSERT INTO user_roles (uid, role) VALUES (?, 'tradesman')
           ON CONFLICT(uid) DO UPDATE SET role='tradesman'`
        ).run(uid);
      });
      tx();

      console.log(
        `${TAG} auto-linked tradesman (SQLite): lead ${lead.user_id} -> uid ${uid} (email=${em})`
      );
      return true;
    } catch (e) {
      console.warn(
        `${TAG} tryAutoLinkLeadByEmail SQLite error:`,
        e?.message || e
      );
      return false;
    }
  }

  // No DB available
  return false;
}

/* ---------- core loader (MySQL + SQLite) ---------- */

async function loadRoleAndTradesman(ctx, uid, emailOpt) {
  const { mysqlQuery, db } = ctx;

  // ---- MySQL path ----
  if (mysqlQuery) {
    let roleRow = null;
    let tRow = null;

    try {
      const roleRows = await mysqlQuery(
        `SELECT role FROM user_roles WHERE uid = ? LIMIT 1`,
        [uid]
      );
      roleRow = roleRows[0] || null;
    } catch {
      // if table missing or other issue, default to "user"
    }

    try {
      const tRows = await mysqlQuery(
        `
        SELECT
          user_id,
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
        WHERE user_id = ?
        LIMIT 1
        `,
        [uid]
      );
      tRow = tRows[0] || null;
    } catch {
      tRow = null;
    }

    // If no profile yet, try to auto-link a lead_* row by email
    if (!tRow && emailOpt) {
      const linked = await tryAutoLinkLeadByEmail(ctx, uid, emailOpt);
      if (linked) {
        try {
          const tRows2 = await mysqlQuery(
            `
            SELECT
              user_id,
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

  // ---- SQLite / better-sqlite3 fallback ----
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

  // No DB: safest fallback
  return { role: "user", tradesman: null };
}

/* ---------- middleware ---------- */

function requireTradesman(ctx) {
  return async (req, res, next) => {
    try {
      const uid = req.user?.uid;
      const email = String(req.user?.email || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const { role, tradesman } = await loadRoleAndTradesman(ctx, uid, email);

      req.userRole = role;
      req.tradesman = tradesman;

      console.log(
        `${TAG} requireTradesman uid=${uid} role=${role} hasProfile=${!!tradesman} status=${
          tradesman?.status || "n/a"
        }`
      );

      if (role !== "tradesman" && !tradesman) {
        return res
          .status(403)
          .json({ error: "Tradesman access required", code: "NO_PROFILE" });
      }
      next();
    } catch (e) {
      console.error(`${TAG} requireTradesman error`, e);
      res.status(500).json({ error: "Role check failed" });
    }
  };
}

function requireActiveTradesman(ctx) {
  return async (req, res, next) => {
    try {
      const uid = req.user?.uid;
      const email = String(req.user?.email || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const { role, tradesman } = await loadRoleAndTradesman(ctx, uid, email);

      req.userRole = role;
      req.tradesman = tradesman;

      console.log(
        `${TAG} requireActiveTradesman uid=${uid} role=${role} hasProfile=${!!tradesman} status=${
          tradesman?.status || "n/a"
        }`
      );

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
      console.error(`${TAG} requireActiveTradesman error`, e);
      res.status(500).json({ error: "Role check failed" });
    }
  };
}

function requireAdmin(ctx) {
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

      console.log(
        `${TAG} requireAdmin uid=${uid} role=${role} allowlisted=${isAllowlisted}`
      );

      if (!isAdminRole && !isAllowlisted) {
        return res.status(403).json({ error: "Admin access required" });
      }
      next();
    } catch (e) {
      console.error(`${TAG} requireAdmin error`, e);
      res.status(500).json({ error: "Role check failed" });
    }
  };
}

module.exports = { requireTradesman, requireActiveTradesman, requireAdmin };

// // server/lib/roles.js

// /**
//  * Attaches role + tradesman row to the request if present:
//  *   req.userRole       -> "admin" | "tradesman" | "user" (fallback)
//  *   req.tradesman      -> { user_id, status, company_name, ... } | null
//  *
//  * Guards:
//  *   requireTradesman(ctx)         -> role === "tradesman" OR has profile (any status)
//  *   requireActiveTradesman(ctx)   -> same, but tradesman.status must be "active"
//  *   requireAdmin(ctx)             -> user_roles.role === "admin" OR email allowlisted
//  *
//  * First-touch auto-link:
//  *   If no tradesman row for uid, but a lead_* row exists with matching email,
//  *   migrate that row to user_id = uid and set user_roles.role = 'tradesman'.
//  */

// function tryAutoLinkLeadByEmail(ctx, uid, email) {
//   const em = String(email || "")
//     .trim()
//     .toLowerCase();
//   if (!uid || !em) return false;

//   // Find most recent lead row for that email
//   const lead = ctx.db
//     .prepare(
//       `
//       SELECT user_id
//       FROM tradesmen
//       WHERE user_id LIKE 'lead_%'
//         AND LOWER(COALESCE(email,'')) = ?
//       ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
//       LIMIT 1
//     `
//     )
//     .get(em);

//   if (!lead) return false;

//   const tx = ctx.db.transaction(() => {
//     ctx.db
//       .prepare(
//         `UPDATE tradesmen
//            SET user_id = ?, updated_at = datetime('now')
//          WHERE user_id = ?`
//       )
//       .run(uid, lead.user_id);

//     ctx.db
//       .prepare(
//         `INSERT INTO user_roles (uid, role) VALUES (?, 'tradesman')
//          ON CONFLICT(uid) DO UPDATE SET role='tradesman'`
//       )
//       .run(uid);
//   });
//   tx();

//   console.log(
//     `[roles] auto-linked tradesman: lead ${lead.user_id} -> uid ${uid} (email=${em})`
//   );
//   return true;
// }

// function loadRoleAndTradesman(ctx, uid, emailOpt) {
//   const roleRow =
//     ctx.db.prepare(`SELECT role FROM user_roles WHERE uid=?`).get(uid) || null;

//   let tRow =
//     ctx.db
//       .prepare(
//         `SELECT user_id, company_name, status, subscription_status,
//                 contact_credits, trade_types, service_areas, email,
//                 created_at, updated_at
//            FROM tradesmen
//           WHERE user_id = ?`
//       )
//       .get(uid) || null;

//   if (!tRow && emailOpt) {
//     const linked = tryAutoLinkLeadByEmail(ctx, uid, emailOpt);
//     if (linked) {
//       tRow =
//         ctx.db
//           .prepare(
//             `SELECT user_id, company_name, status, subscription_status,
//                     contact_credits, trade_types, service_areas, email,
//                     created_at, updated_at
//                FROM tradesmen
//               WHERE user_id = ?`
//           )
//           .get(uid) || null;
//     }
//   }

//   const role = String(roleRow?.role || "user").toLowerCase();
//   return { role, tradesman: tRow };
// }

// function requireTradesman(ctx) {
//   return async (req, res, next) => {
//     try {
//       const uid = req.user?.uid;
//       const email = String(req.user?.email || "");
//       if (!uid) return res.status(401).json({ error: "Unauthorized" });

//       const { role, tradesman } = loadRoleAndTradesman(ctx, uid, email);

//       req.userRole = role;
//       req.tradesman = tradesman;

//       console.log(
//         `[roles] requireTradesman uid=${uid} role=${role} hasProfile=${!!tradesman} status=${
//           tradesman?.status || "n/a"
//         }`
//       );

//       if (role !== "tradesman" && !tradesman) {
//         return res
//           .status(403)
//           .json({ error: "Tradesman access required", code: "NO_PROFILE" });
//       }
//       next();
//     } catch (e) {
//       console.error("[roles] requireTradesman error", e);
//       res.status(500).json({ error: "Role check failed" });
//     }
//   };
// }

// function requireActiveTradesman(ctx) {
//   return async (req, res, next) => {
//     try {
//       const uid = req.user?.uid;
//       const email = String(req.user?.email || "");
//       if (!uid) return res.status(401).json({ error: "Unauthorized" });

//       const { role, tradesman } = loadRoleAndTradesman(ctx, uid, email);

//       req.userRole = role;
//       req.tradesman = tradesman;

//       console.log(
//         `[roles] requireActiveTradesman uid=${uid} role=${role} hasProfile=${!!tradesman} status=${
//           tradesman?.status || "n/a"
//         }`
//       );

//       if (!tradesman) {
//         return res
//           .status(403)
//           .json({ error: "Tradesman profile required", code: "NO_PROFILE" });
//       }
//       if (String(tradesman.status || "").toLowerCase() !== "active") {
//         return res.status(403).json({
//           error: "Tradesman not active",
//           code: "NOT_ACTIVE",
//           status: tradesman.status || "unknown",
//         });
//       }
//       next();
//     } catch (e) {
//       console.error("[roles] requireActiveTradesman error", e);
//       res.status(500).json({ error: "Role check failed" });
//     }
//   };
// }

// function requireAdmin(ctx) {
//   const allowlist = (process.env.ADMIN_EMAILS || "")
//     .split(",")
//     .map((s) => s.trim().toLowerCase())
//     .filter(Boolean);

//   return async (req, res, next) => {
//     try {
//       const uid = req.user?.uid;
//       if (!uid) return res.status(401).json({ error: "Unauthorized" });

//       const email = String(req.user?.email || "").toLowerCase();
//       const { role } = loadRoleAndTradesman(ctx, uid, email);

//       const isAdminRole = role === "admin";
//       const isAllowlisted = email && allowlist.includes(email);

//       console.log(
//         `[roles] requireAdmin uid=${uid} role=${role} allowlisted=${isAllowlisted}`
//       );

//       if (!isAdminRole && !isAllowlisted) {
//         return res.status(403).json({ error: "Admin access required" });
//       }
//       next();
//     } catch (e) {
//       console.error("[roles] requireAdmin error", e);
//       res.status(500).json({ error: "Role check failed" });
//     }
//   };
// }

// module.exports = { requireTradesman, requireActiveTradesman, requireAdmin };
