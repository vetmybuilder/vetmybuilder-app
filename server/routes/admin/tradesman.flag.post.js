/**
 * POST /api/admin/tradesmen/:uid/flag
 * Body: { reason: string, severity?: "info"|"warn"|"block" }
 * Auth: admin
 */
module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  const { requireAdmin } = require("../../lib/roles");
  const TAG = "[admin.tradesmen.flag.post]";

  // Best-effort: ensure flags table exists (MySQL)
  const ensureFlagsTable = async () => {
    try {
      await mysqlQuery(
        `
        CREATE TABLE IF NOT EXISTS tradesmen_flags (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          created_by VARCHAR(255) NOT NULL,
          reason TEXT NOT NULL,
          severity ENUM('info','warn','block') NOT NULL DEFAULT 'warn',
          resolved_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_tradesmen_flags_user (user_id),
          INDEX idx_tradesmen_flags_created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
      );
    } catch (e) {
      console.warn(`${TAG} ensureFlagsTable failed:`, e?.message || String(e));
    }
  };

  console.log("[routes] mounted: POST /admin/tradesmen/:uid/flag");

  router.post(
    "/admin/tradesmen/:uid/flag",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      try {
        await ensureFlagsTable();

        const uid = String(req.params.uid || "").trim();
        const reason = String(req.body?.reason || "").trim();
        const rawSeverity = String(req.body?.severity || "warn");
        const allowed = ["info", "warn", "block"];
        const severity = allowed.includes(rawSeverity) ? rawSeverity : "warn";

        if (!uid) {
          return res.status(400).json({ error: "uid required" });
        }
        if (!reason) {
          return res.status(400).json({ error: "reason required" });
        }

        // Ensure tradesman exists
        let rows;
        try {
          rows = await mysqlQuery(
            `SELECT 1 FROM tradesmen WHERE user_id = ? LIMIT 1`,
            [uid]
          );
        } catch (e) {
          console.error(`${TAG} tradesmen existence check failed`, e);
          return res
            .status(500)
            .json({ error: "internal_error", message: "lookup_failed" });
        }

        if (!rows || rows.length === 0) {
          return res.status(404).json({ error: "tradesman not found" });
        }

        // Insert flag
        let insertResult;
        try {
          insertResult = await mysqlQuery(
            `
            INSERT INTO tradesmen_flags (user_id, created_by, reason, severity)
            VALUES (?, ?, ?, ?)
          `,
            [uid, String(req.user.uid), reason, severity]
          );
        } catch (e) {
          console.error(`${TAG} insert failed`, e);
          return res.status(500).json({
            error: "internal_error",
            message: "failed_to_create_flag",
          });
        }

        const insertedId = insertResult.insertId;

        // Fetch the newly created flag
        let flagRows;
        try {
          flagRows = await mysqlQuery(
            `SELECT * FROM tradesmen_flags WHERE id = ? LIMIT 1`,
            [insertedId]
          );
        } catch (e) {
          console.warn(`${TAG} select-after-insert failed`, e);
          // Still return ok, but without full row if something went weird
          return res.status(201).json({
            ok: true,
            flag: { id: insertedId, user_id: uid, reason, severity },
          });
        }

        const flag = flagRows[0] || null;

        return res.status(201).json({ ok: true, flag });
      } catch (e) {
        console.error(`${TAG} handler error`, e);
        return res
          .status(500)
          .json({ error: "internal_error", message: e?.message || String(e) });
      }
    }
  );
};

// /**
//  * POST /api/admin/tradesmen/:uid/flag
//  * Body: { reason: string, severity?: "info"|"warn"|"block" }
//  * Auth: admin
//  */
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;
//   const { requireAdmin } = require("../../lib/roles");

//   console.log("[routes] mounted: POST /admin/tradesmen/:uid/flag");

//   router.post(
//     "/admin/tradesmen/:uid/flag",
//     auth,
//     requireAdmin(ctx),
//     (req, res) => {
//       const uid = String(req.params.uid || "");
//       const reason = String(req.body?.reason || "").trim();
//       const severity = ["info", "warn", "block"].includes(
//         String(req.body?.severity || "warn")
//       )
//         ? String(req.body.severity || "warn")
//         : "warn";

//       if (!uid) return res.status(400).json({ error: "uid required" });
//       if (!reason) return res.status(400).json({ error: "reason required" });

//       const exists = db
//         .prepare(`SELECT 1 FROM tradesmen WHERE user_id=?`)
//         .get(uid);
//       if (!exists)
//         return res.status(404).json({ error: "tradesman not found" });

//       const info = db
//         .prepare(
//           `
//       INSERT INTO tradesmen_flags (user_id, created_by, reason, severity)
//       VALUES (?, ?, ?, ?)
//     `
//         )
//         .run(uid, req.user.uid, reason, severity);

//       const flag = db
//         .prepare(`SELECT * FROM tradesmen_flags WHERE id=?`)
//         .get(info.lastInsertRowid);
//       return res.status(201).json({ ok: true, flag });
//     }
//   );
// };
