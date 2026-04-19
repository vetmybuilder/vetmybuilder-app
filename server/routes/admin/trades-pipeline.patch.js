const { logger, withRequest } = require("../../lib/logger");
const { normaliseCompanyName } = require("../../lib/matchRecommendationToTradesman");

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

      // When approving, check if a matching tradesman already exists and auto-link
      if (action === "approved" && !rows[0].claimed_by) {
        try {
          const companyName = rows[0].company_name;
          const normName = normaliseCompanyName(companyName);
          if (normName) {
            const tradesmen = await mysqlQuery(
              "SELECT user_id, company_name FROM tradesmen WHERE company_name IS NOT NULL",
            );
            const match = tradesmen.find(
              (t) => normaliseCompanyName(t.company_name) === normName,
            );
            if (match) {
              await mysqlQuery(
                "UPDATE tradesperson_pipeline SET claimed_by = ? WHERE id = ?",
                [match.user_id, id],
              );
              // Also link any existing pipeline recommendations
              const pipelineRecs = await mysqlQuery(
                "SELECT id, company FROM recommendations WHERE source = 'pipeline' AND linked_tradesman_uid IS NULL",
              );
              for (const rec of pipelineRecs) {
                if (normaliseCompanyName(rec.company) === normName) {
                  await mysqlQuery(
                    "UPDATE recommendations SET linked_tradesman_uid = ? WHERE id = ?",
                    [match.user_id, rec.id],
                  );
                }
              }
              log.info({ id, tradesman: match.user_id, company: companyName }, "pipeline entry auto-linked to existing tradesman on approval");
            }
          }
        } catch (linkErr) {
          log.warn({ err: linkErr?.message, id }, "auto-link on approval failed (non-fatal)");
        }
      }

      log.info({ id, status: action, company: rows[0].company_name }, "pipeline entry updated");
      ctx.logActivity?.("admin.pipeline.update", "info", req.user?.uid, `Pipeline entry #${id} ${action}: ${rows[0].company_name}`);
      return res.json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message, id }, "pipeline update failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
