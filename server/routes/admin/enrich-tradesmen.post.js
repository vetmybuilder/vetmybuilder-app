// server/routes/admin/enrich-tradesmen.post.js
const { requireAdmin } = require("../../lib/roles");
const { logger, withRequest } = require("../../lib/logger");
const { enrichTradesmanWithGoogle } = require("../../lib/ai/googleEnricher");

const TAG = "admin.enrich-tradesmen";

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post(
    "/admin/enrich-tradesmen",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: TAG });

      try {
        const rows = await mysqlQuery(`
          SELECT user_id, company_name, ch_name, service_areas, web_url
          FROM tradesmen
          WHERE (google_place_id IS NULL OR google_rating IS NULL)
            AND company_name IS NOT NULL
            AND TRIM(company_name) != ''
            AND status = 'active'
        `);

        let enriched = 0;
        let skipped = 0;
        let failed = 0;

        for (const row of rows) {
          const name = row.ch_name || row.company_name;
          const hint = row.service_areas
            ? String(row.service_areas).split(",")[0]
            : undefined;

          const result = await enrichTradesmanWithGoogle({
            mysqlQuery,
            userId: row.user_id,
            companyName: name,
            locationHint: hint,
            existingWebUrl: row.web_url || null,
            log,
          });

          if (result) {
            enriched += 1;
          } else {
            skipped += 1;
          }
        }

        log.info({ enriched, skipped, failed, total: rows.length }, "batch enrich complete");
        res.json({ ok: true, enriched, skipped, failed });
        ctx.logActivity("admin.enrich", "info", req.user?.uid || "system", "Tradesmen enrichment run");
        return;
      } catch (err) {
        logger.error({ route: TAG, err: err?.message }, "batch enrich failed");
        return res.status(500).json({ error: "server_error" });
      }
    },
  );
};
