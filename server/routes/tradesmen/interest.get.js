// server/routes/tradesmen/interest.get.js

/**
 * GET /tradesmen/interest?projectId=123
 * Auth: tradesman
 * → { shared: boolean, recommendationId?: number, shareId?: number, linkPath?: string }
 *
 * Behavior:
 * - Primary check: trade_shares (new one-time share flow)
 * - Fallback: tradesman_interests (legacy flow with recommendationId)
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery, requireTradesman = null } = ctx;

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  router.get(
    "/tradesmen/interest",
    auth,
    maybe(requireTradesman),
    async (req, res) => {
      try {
        const uid = req.user?.uid;
        const projectId = Number(req.query.projectId);

        if (!uid) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        if (!Number.isFinite(projectId)) {
          return res.status(400).json({ error: "projectId is required" });
        }

        // --- 1) New flow: has the tradesman already submitted a share? ---
        let share = null;
        try {
          const shareRows = await mysqlQuery(
            `SELECT id
               FROM trade_shares
              WHERE project_id = ?
                AND tradesman_uid = ?
              LIMIT 1`,
            [projectId, uid]
          );
          share = shareRows[0] || null;
        } catch (e) {
          // If table is missing or other error, treat as "no share" and fall through
          console.warn(
            "[tradesmen/interest.get] trade_shares lookup failed:",
            e?.message || e
          );
        }

        if (share) {
          return res.json({
            ok: true,
            shared: true,
            shareId: Number(share.id),
            // Deep-link to the owner's "Shared profiles" list for this project.
            linkPath: `/projects/${projectId}/shares`,
          });
        }

        // --- 2) Legacy flow: fall back to tradesman_interests (recommendationId) ---
        let legacyRow = null;
        try {
          const rows = await mysqlQuery(
            `SELECT recommendationId
               FROM tradesman_interests
              WHERE projectId = ?
                AND fromUid = ?
              LIMIT 1`,
            [projectId, uid]
          );
          legacyRow = rows[0] || null;
        } catch (e) {
          // If legacy table doesn't exist, just treat as not shared
          console.warn(
            "[tradesmen/interest.get] tradesman_interests lookup failed:",
            e?.message || e
          );
        }

        if (!legacyRow) {
          return res.json({ ok: true, shared: false });
        }

        const recommendationId = Number(legacyRow.recommendationId);
        return res.json({
          ok: true,
          shared: true,
          recommendationId,
          // Preserve old link shape for legacy consumers
          linkPath: `/builders/${recommendationId}`,
        });
      } catch (e) {
        console.error("[tradesmen/interest.get] error", e);
        return res.status(500).json({ error: "Failed to load interest state" });
      }
    }
  );
};

/* ---- shared helpers (kept local so file stays self-contained) ---- */
function maybe(mw) {
  if (typeof mw !== "function") return (_req, _res, next) => next();
  return mw;
}

// /**
//  * GET /tradesmen/interest?projectId=123
//  * Auth: tradesman
//  * → { shared: boolean, recommendationId?: number, shareId?: number, linkPath?: string }
//  *
//  * Behavior:
//  * - Primary check: trade_shares (new one-time share flow)
//  * - Fallback: tradesman_interests (legacy flow with recommendationId)
//  */
// module.exports = (router, ctx) => {
//   const { db, auth, requireTradesman = null } = ctx;

//   ensureTradeSharesTable(db); // new flow table (safe to ensure)
//   ensureInterestsTable(db); // legacy table (kept for back-compat)

//   router.get(
//     "/tradesmen/interest",
//     auth,
//     maybe(requireTradesman),
//     (req, res) => {
//       const uid = req.user.uid;
//       const projectId = Number(req.query.projectId);
//       if (!Number.isFinite(projectId)) {
//         return res.status(400).json({ error: "projectId is required" });
//       }

//       // --- 1) New flow: has the tradesman already submitted a share? ---
//       const share = db
//         .prepare(
//           `SELECT id FROM trade_shares WHERE project_id = ? AND tradesman_uid = ? LIMIT 1`
//         )
//         .get(projectId, uid);

//       if (share) {
//         return res.json({
//           ok: true,
//           shared: true,
//           shareId: Number(share.id),
//           // Deep-link to the owner's "Shared profiles" list for this project.
//           linkPath: `/projects/${projectId}/shares`,
//         });
//       }

//       // --- 2) Legacy flow: fall back to tradesman_interests (recommendationId) ---
//       const row = db
//         .prepare(
//           `SELECT recommendationId
//          FROM tradesman_interests
//         WHERE projectId = ? AND fromUid = ?
//         LIMIT 1`
//         )
//         .get(projectId, uid);

//       if (!row) return res.json({ ok: true, shared: false });

//       const recommendationId = Number(row.recommendationId);
//       return res.json({
//         ok: true,
//         shared: true,
//         recommendationId,
//         // Preserve old link shape for legacy consumers
//         linkPath: `/builders/${recommendationId}`,
//       });
//     }
//   );
// };

// /* ---- shared helpers (kept local so file stays self-contained) ---- */
// function maybe(mw) {
//   if (typeof mw !== "function") return (_req, _res, next) => next();
//   return mw;
// }

// function ensureInterestsTable(db) {
//   db.prepare(
//     `
//     CREATE TABLE IF NOT EXISTS tradesman_interests (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       projectId INTEGER NOT NULL,
//       fromUid TEXT NOT NULL,
//       recommendationId INTEGER NOT NULL,
//       note TEXT,
//       createdAt TEXT NOT NULL,
//       UNIQUE(projectId, fromUid)
//     )
//   `
//   ).run();
// }

// function ensureTradeSharesTable(db) {
//   db.prepare(
//     `
//     CREATE TABLE IF NOT EXISTS trade_shares (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       project_id INTEGER NOT NULL,
//       tradesman_uid TEXT NOT NULL,
//       photos_json TEXT NOT NULL DEFAULT '[]',
//       message TEXT DEFAULT '',
//       created_at TEXT NOT NULL DEFAULT (datetime('now')),
//       UNIQUE(project_id, tradesman_uid)
//     )
//   `
//   ).run();
// }
