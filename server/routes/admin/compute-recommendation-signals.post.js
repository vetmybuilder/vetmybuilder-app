// server/routes/admin/compute-recommendation-signals.post.js
const { requireAdmin } = require("../../lib/roles");
const { logger, withRequest } = require("../../lib/logger");
const {
  computeRecommendationSignals,
} = require("../../lib/ai/recommendationSignaller");

const TAG = "admin.compute-recommendation-signals";

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post(
    "/admin/compute-recommendation-signals",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: TAG });

      try {
        // Find recommendations without signals
        const rows = await mysqlQuery(`
          SELECT r.id, r.comment
          FROM recommendations r
          LEFT JOIN recommendation_signals rs ON rs.recommendation_id = r.id
          WHERE rs.recommendation_id IS NULL
            AND r.comment IS NOT NULL
            AND TRIM(r.comment) != ''
        `);

        let computed = 0;
        let failed = 0;

        for (const row of rows) {
          const result = await computeRecommendationSignals({
            mysqlQuery,
            recommendationId: row.id,
            comment: row.comment,
            log,
          });

          if (result) {
            computed += 1;
          } else {
            failed += 1;
          }
        }

        log.info({ computed, failed, total: rows.length }, "recommendation signals batch complete");
        return res.json({ ok: true, computed, skipped: 0, failed });
      } catch (err) {
        logger.error({ route: TAG, err: err?.message }, "batch failed");
        return res.status(500).json({ error: "server_error" });
      }
    },
  );
};
