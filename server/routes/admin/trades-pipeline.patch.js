const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.patch("/admin/trades-pipeline/:id", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.trades-pipeline.patch" });
    const id = parseInt(req.params.id, 10);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const action = String(req.body?.status || "").trim().toLowerCase();
    if (!["approved", "rejected"].includes(action)) {
      return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    }

    try {
      const rows = await mysqlQuery("SELECT id, company_name, status FROM tradesperson_pipeline WHERE id = ?", [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Not found" });
      }

      await mysqlQuery(
        "UPDATE tradesperson_pipeline SET status = ?, reviewed_at = NOW() WHERE id = ?",
        [action, id],
      );

      log.info({ id, status: action, company: rows[0].company_name }, "pipeline entry updated");
      ctx.logActivity?.("admin.pipeline.update", "info", req.user?.uid, `Pipeline entry #${id} ${action}: ${rows[0].company_name}`);
      return res.json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message, id }, "pipeline update failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
