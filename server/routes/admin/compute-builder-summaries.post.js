// server/routes/admin/compute-builder-summaries.post.js
const { requireAdmin } = require("../../lib/roles");
const { logger, withRequest } = require("../../lib/logger");
const {
  summariseBuilderRecommendations,
} = require("../../lib/ai/recommendationSummariser");

const TAG = "admin.compute-builder-summaries";

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post(
    "/admin/compute-builder-summaries",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: TAG });

      try {
        // Find all companies with >= 3 recommendations
        const companies = await mysqlQuery(`
          SELECT company, GROUP_CONCAT(id) AS ids, COUNT(*) AS cnt
          FROM recommendations
          WHERE company IS NOT NULL AND TRIM(company) != ''
          GROUP BY company
          HAVING cnt >= 3
        `);

        let computed = 0;
        let skipped = 0;
        let failed = 0;

        for (const row of companies) {
          const company = row.company;
          const recIds = String(row.ids)
            .split(",")
            .map(Number)
            .sort((a, b) => a - b);

          // Staleness check: skip if recommendation set hasn't changed
          const existing = await mysqlQuery(
            `SELECT recommendation_ids FROM builder_summaries WHERE company = ? LIMIT 1`,
            [company],
          );

          if (existing.length > 0) {
            try {
              const cachedIds = JSON.parse(existing[0].recommendation_ids);
              if (JSON.stringify(cachedIds) === JSON.stringify(recIds)) {
                skipped += 1;
                continue;
              }
            } catch {
              // parse failed — recompute
            }
          }

          // Fetch the actual comments
          const placeholders = recIds.map(() => "?").join(",");
          const recs = await mysqlQuery(
            `SELECT id, comment FROM recommendations WHERE id IN (${placeholders}) ORDER BY id`,
            recIds,
          );
          const comments = recs
            .map((r) => String(r.comment || "").trim())
            .filter(Boolean);

          if (comments.length < 3) {
            skipped += 1;
            continue;
          }

          const result = await summariseBuilderRecommendations({
            mysqlQuery,
            company,
            comments,
            recommendationIds: recIds,
            log,
          });

          if (result) {
            computed += 1;
          } else {
            failed += 1;
          }
        }

        log.info({ computed, skipped, failed }, "builder summaries batch complete");
        return res.json({ ok: true, computed, skipped, failed });
      } catch (err) {
        logger.error({ route: TAG, err: err?.message }, "batch failed");
        return res.status(500).json({ error: "server_error" });
      }
    },
  );
};
