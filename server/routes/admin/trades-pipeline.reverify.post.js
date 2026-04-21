/**
 * POST /api/admin/trades-pipeline/reverify
 * Auth: admin only
 * Runs Companies House lookup on pipeline entries that have no CH data.
 * Optionally pass { ids: [1,2,3] } to target specific entries.
 */
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");
  const { matchByName } = require("../../lib/companiesHouse");

  router.post("/admin/trades-pipeline/reverify", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.trades-pipeline.reverify" });

    try {
      let rows;
      const ids = req.body?.ids;
      if (Array.isArray(ids) && ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        rows = await mysqlQuery(
          `SELECT id, company_name, service_areas FROM tradesperson_pipeline WHERE id IN (${placeholders})`,
          ids.map(Number)
        );
      } else {
        rows = await mysqlQuery(
          `SELECT id, company_name, service_areas FROM tradesperson_pipeline WHERE company_number IS NULL OR company_number = ''`
        );
      }

      if (rows.length === 0) {
        return res.json({ ok: true, updated: 0, message: "No entries to verify" });
      }

      let updated = 0;
      const results = [];

      for (const row of rows) {
        const name = row.company_name;
        const area = (row.service_areas || "").split(",")[0]?.trim() || "";

        try {
          const chResult = await matchByName({ name, locationHint: area });

          if (chResult?.best?.number) {
            const chNumber = chResult.best.number;
            const chStatus = chResult.best.status || null;
            const chName = chResult.best.name || null;

            // Recalc vetting score with CH bonus
            const existing = await mysqlQuery(
              "SELECT google_rating, google_reviews_count, vetting_score FROM tradesperson_pipeline WHERE id = ?",
              [row.id]
            );
            const entry = existing[0];
            const ratingPart = (entry?.google_rating || 0) * 10;
            const reviewPart = Math.min(entry?.google_reviews_count || 0, 100) * 0.3;
            const chPart = chResult.verdict === "verified" ? 20 : 0;
            const newScore = Math.round(ratingPart + reviewPart + chPart);

            await mysqlQuery(
              `UPDATE tradesperson_pipeline
               SET company_number = ?, ch_status = ?, ch_name = ?, vetting_score = ?
               WHERE id = ?`,
              [chNumber, chStatus, chName, newScore, row.id]
            );

            updated++;
            results.push({ id: row.id, name, chNumber, chStatus, verdict: chResult.verdict });
            log.info({ id: row.id, name, chNumber, chStatus }, "[reverify] updated");
          } else {
            results.push({ id: row.id, name, verdict: chResult?.verdict || "no_match" });
            log.info({ id: row.id, name, verdict: chResult?.verdict }, "[reverify] no match");
          }
        } catch (err) {
          results.push({ id: row.id, name, error: err?.message });
          log.error({ id: row.id, name, err: err?.message }, "[reverify] CH lookup failed");
        }
      }

      res.json({ ok: true, updated, total: rows.length, results });
    } catch (err) {
      log.error({ err: err?.message }, "[reverify] failed");
      res.status(500).json({ error: "Failed to re-verify" });
    }
  });
};
