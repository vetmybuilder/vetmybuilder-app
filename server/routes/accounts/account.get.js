// server/routes/accounts/account.get.js
/**
 * GET /api/account
 * Auth: required (Bearer). Also runs touchUser to upsert the user row.
 *
 * Default (no query): { user, profile }   // original shape for self
 *
 * Minimal view (with ?minimal=1):
 *   - Self: allowed
 *   - Admin: allowed for any uid
 *   - Tradesman with active paid plan: allowed for any uid
 *
 * Query:
 *   ?minimal=1&uid=<targetUid>
 */
module.exports = (router, ctx) => {
  const { auth, touchUserMw, mysqlQuery } = ctx;

  async function isAdmin(req) {
    if (!req.user) return false;
    try {
      // Check user_roles first
      const roleRows = await mysqlQuery(
        "SELECT role FROM user_roles WHERE uid = ?",
        [req.user.uid]
      );
      const row = roleRows[0] || null;
      const role = String(row?.role || "user").toLowerCase();
      if (role === "admin") return true;

      // Fallback: ADMIN_EMAILS allowlist
      const allowlist = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const email = String(req.user?.email || "")
        .trim()
        .toLowerCase();
      return email && allowlist.includes(email);
    } catch {
      return false;
    }
  }

  /** Is the requester a tradesman with an ACTIVE non-free subscription? */
  async function hasActivePaidPlan(uid) {
    try {
      const rows = await mysqlQuery(
        `SELECT COALESCE(subscription_status,'inactive') AS s,
                LOWER(COALESCE(plan,'free')) AS p
           FROM tradesmen
          WHERE user_id = ?`,
        [uid]
      );
      const r = rows[0] || null;
      if (!r) return false;
      return String(r.s) === "active" && String(r.p) !== "free";
    } catch {
      return false;
    }
  }

  router.get("/account", auth, touchUserMw, async (req, res) => {
    const requesterUid = req.user.uid;

    const minimal = String(req.query.minimal || "").toLowerCase() === "1";
    const targetUid = String(req.query.uid || requesterUid);

    if (minimal) {
      try {
        const sameUser = targetUid === requesterUid;
        const admin = await isAdmin(req);
        const activePaid = await hasActivePaidPlan(requesterUid);

        if (!sameUser && !admin && !activePaid) {
          return res.status(403).json({ error: "forbidden" });
        }

        const userRows = await mysqlQuery(
          `SELECT uid, firstName, lastName, email
             FROM users
            WHERE uid = ?`,
          [targetUid]
        );
        const user = userRows[0] || null;

        return res.json({ user });
      } catch (err) {
        console.error("Error in /account minimal MySQL path:", err);
        return res.status(500).json({ error: "internal_error" });
      }
    }

    // -------- Original self shape --------
    try {
      const userRows = await mysqlQuery(
        `SELECT uid, email, firstName, lastName, username,
                locationRaw, postcode, postcodeSector, postcodeOutward, city
           FROM users
          WHERE uid = ?`,
        [requesterUid]
      );
      const user = userRows[0] || null;

      const profileRows = await mysqlQuery(
        `SELECT uid AS userId,
                locationRaw,
                postcode,
                postcodeSector,
                postcodeOutward,
                city,
                createdAt AS updatedAt
           FROM users
          WHERE uid = ?`,
        [requesterUid]
      );
      const profile = profileRows[0] || null;

      return res.json({ user, profile });
    } catch (err) {
      console.error("Error in /account MySQL path:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};

// // server/v2/routes/account/account.get.js
// /**
//  * GET /api/account
//  * Auth: required (Bearer). Also runs touchUser to upsert the user row.
//  *
//  * Default (no query): { user, profile }   // original shape for self
//  *
//  * Minimal view (with ?minimal=1):
//  *   - Self: allowed
//  *   - Admin: allowed for any uid
//  *   - Tradesman with ACTIVE paid plan (plan != 'free'): allowed for any uid
//  *     (This supports revealing owner contact when your plan is active.)
//  *
//  * Query:
//  *   ?minimal=1&uid=<targetUid>
//  */
// module.exports = (router, ctx) => {
//   const { db, auth, touchUserMw } = ctx;

//   function isAdmin(req) {
//     if (!req.user) return false;
//     try {
//       const row =
//         db
//           .prepare(`SELECT role FROM user_roles WHERE uid=?`)
//           .get(req.user.uid) || null;
//       const role = String(row?.role || "user").toLowerCase();
//       if (role === "admin") return true;

//       const allowlist = (process.env.ADMIN_EMAILS || "")
//         .split(",")
//         .map((s) => s.trim().toLowerCase())
//         .filter(Boolean);
//       const email = String(req.user?.email || "")
//         .trim()
//         .toLowerCase();
//       return email && allowlist.includes(email);
//     } catch {
//       return false;
//     }
//   }

//   /** Is the requester a tradesman with an ACTIVE non-free subscription? */
//   function hasActivePaidPlan(uid) {
//     try {
//       const r =
//         db
//           .prepare(
//             `SELECT COALESCE(subscription_status,'inactive') AS s,
//                     LOWER(COALESCE(plan,'free')) AS p
//                FROM tradesmen
//               WHERE user_id = ?`
//           )
//           .get(uid) || null;
//       if (!r) return false;
//       return String(r.s) === "active" && String(r.p) !== "free";
//     } catch {
//       return false;
//     }
//   }

//   router.get("/account", auth, touchUserMw, (req, res) => {
//     const requesterUid = req.user.uid;

//     const minimal = String(req.query.minimal || "").toLowerCase() === "1";
//     const targetUid = String(req.query.uid || requesterUid);

//     if (minimal) {
//       const sameUser = targetUid === requesterUid;
//       const admin = isAdmin(req);
//       const activePaid = hasActivePaidPlan(requesterUid);

//       if (!sameUser && !admin && !activePaid) {
//         return res.status(403).json({ error: "forbidden" });
//       }

//       const user =
//         db
//           .prepare(
//             `SELECT uid, firstName, lastName, email
//                FROM users
//               WHERE uid = ?`
//           )
//           .get(targetUid) || null;

//       return res.json({ user });
//     }

//     // -------- Original self shape --------
//     const user =
//       db
//         .prepare(
//           `SELECT uid, email, firstName, lastName, username,
//                   locationRaw, postcode, postcodeSector, postcodeOutward, city
//              FROM users
//             WHERE uid = ?`
//         )
//         .get(requesterUid) || null;

//     const profile =
//       db
//         .prepare(
//           `SELECT uid AS userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, createdAt AS updatedAt
//              FROM users
//             WHERE uid = ?`
//         )
//         .get(requesterUid) || null;

//     res.json({ user, profile });
//   });
// };
