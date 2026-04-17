// server/routes/reports/reports.post.js
const { logger, withRequest } = require("../../lib/logger");
const analytics = require("../../lib/analytics");

const VALID_TARGET_TYPES = ["profile", "recommendation", "photo"];
const VALID_CATEGORIES = ["abuse", "spam", "fake_review", "inappropriate_image", "other"];

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post("/reports", auth, async (req, res) => {
    const log = withRequest(req).child({ route: "reports.create" });
    const uid = req.user?.uid;

    try {
      const { targetType, targetId, category, detail } = req.body || {};

      if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
        return res.status(400).json({ error: "Invalid target type" });
      }
      if (!targetId) {
        return res.status(400).json({ error: "Target ID is required" });
      }
      if (!category || !VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }

      // Prevent duplicate reports from the same user on the same target
      const existing = await mysqlQuery(
        `SELECT id FROM reports WHERE reporter_uid = ? AND target_type = ? AND target_id = ? AND status = 'open'`,
        [uid, targetType, String(targetId)],
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: "ALREADY_REPORTED" });
      }

      const detailVal = detail ? String(detail).trim().slice(0, 1000) : null;
      await mysqlQuery(
        `INSERT INTO reports (reporter_uid, target_type, target_id, category, detail)
         VALUES (?, ?, ?, ?, ?)`,
        [uid || null, targetType || null, String(targetId || ""), category || null, detailVal || null],
      );

      log.info({ targetType, targetId, category }, "report created");
      analytics.trackReportCreated(req.user?.uid, { targetType, targetId: String(targetId), category });
      ctx.logActivity("report.created", "info", uid, `${category} report on ${targetType} #${targetId}`);
      return res.status(201).json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message }, "report creation failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
