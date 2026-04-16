// server/routes/admin/reports.resolve.patch.js
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.patch("/admin/reports/:id/resolve", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.reports.resolve" });
    const reportId = parseInt(req.params.id, 10);
    const action = String(req.body?.action || "").toLowerCase();

    if (!["reviewed", "dismissed"].includes(action)) {
      return res.status(400).json({ error: "Action must be 'reviewed' or 'dismissed'" });
    }

    try {
      const rows = await mysqlQuery(`SELECT id, status FROM reports WHERE id = ?`, [reportId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Report not found" });
      }
      if (rows[0].status !== "open") {
        return res.status(409).json({ error: "Report already resolved" });
      }

      await mysqlQuery(
        `UPDATE reports SET status = ?, resolved_at = NOW(), resolved_by = ? WHERE id = ?`,
        [action, req.user?.uid, reportId],
      );

      log.info({ reportId, action }, "report resolved");
      ctx.logActivity("report.resolved", "info", req.user?.uid, `Report #${reportId} ${action}`);
      return res.json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message }, "report resolve failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
