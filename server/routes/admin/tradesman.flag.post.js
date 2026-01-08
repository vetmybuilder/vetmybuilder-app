/**
 * POST /api/admin/tradesmen/:uid/flag
 * Body: { reason: string, severity?: "info"|"warn"|"block" }
 * Auth: admin
 */

const { withRequest, logger } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  const { requireAdmin } = require("../../lib/roles");
  const TAG = "admin.tradesmen.flag.post";

  // ---- Ensure table exists ----
  const ensureFlagsTable = async (log) => {
    try {
      await mysqlQuery(`
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
      `);
    } catch (e) {
      log.error({ err: e?.message }, "Failed to ensure tradesmen_flags table");
    }
  };

  // ---- Route Mount Log ----
  if (!ctx.__logged_flag_post) {
    ctx.__logged_flag_post = true;
    logger.info(
      { route: "/admin/tradesmen/:uid/flag" },
      "Mounted admin flag route"
    );
  }

  // ---- Route Handler ----
  router.post(
    "/admin/tradesmen/:uid/flag",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({
        route: TAG,
        targetUid: req.params.uid,
      });

      try {
        await ensureFlagsTable(log);

        const uid = String(req.params.uid || "").trim();
        const reason = String(req.body?.reason || "").trim();
        const rawSeverity = String(req.body?.severity || "warn");
        const allowed = ["info", "warn", "block"];
        const severity = allowed.includes(rawSeverity) ? rawSeverity : "warn";

        if (!uid) {
          log.warn("Missing uid");
          return res.status(400).json({ error: "uid required" });
        }
        if (!reason) {
          log.warn("Missing reason");
          return res.status(400).json({ error: "reason required" });
        }

        // Ensure tradesman exists
        let exists;
        try {
          exists = await mysqlQuery(
            `SELECT 1 FROM tradesmen WHERE user_id = ? LIMIT 1`,
            [uid]
          );
        } catch (e) {
          log.error({ err: e?.message }, "Failed checking tradesman existence");
          return res
            .status(500)
            .json({ error: "internal_error", message: "lookup_failed" });
        }

        if (!exists?.length) {
          log.warn({ uid }, "Tradesman not found");
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
          log.info({ uid, severity, reason }, "Inserted tradesmen flag");
        } catch (e) {
          log.error({ err: e?.message }, "Insert failed");
          return res.status(500).json({
            error: "internal_error",
            message: "failed_to_create_flag",
          });
        }

        const insertedId = insertResult.insertId;
        let flagRows;

        try {
          flagRows = await mysqlQuery(
            `SELECT * FROM tradesmen_flags WHERE id = ? LIMIT 1`,
            [insertedId]
          );
        } catch (e) {
          log.error({ err: e?.message }, "Select-after-insert failed");
          return res.status(201).json({
            ok: true,
            flag: { id: insertedId, user_id: uid, reason, severity },
          });
        }

        const flag = flagRows[0] || null;

        return res.status(201).json({ ok: true, flag });
      } catch (e) {
        log.error(
          { err: e?.message, stack: e?.stack },
          "Unhandled handler error"
        );
        return res.status(500).json({
          error: "internal_error",
          message: e?.message || String(e),
        });
      }
    }
  );
};
