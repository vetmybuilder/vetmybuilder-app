/**
 * GET /api/admin/acquisition/summary
 * Returns one row per acquisition `ref`:
 *   { ref, scans, signups, conversion, first_scan, last_scan }
 *
 * scans   = COUNT(*) from acquisition_scans
 * signups = COUNT(*) from tradesmen WHERE acq_ref = ref
 *
 * Refs that have scans but no signups still appear (scans > 0, signups = 0).
 * Refs that have signups but no scans (e.g. someone signed up after the
 * scan table was wiped, or via a direct link without /go/) also appear.
 */
module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get(
    "/admin/acquisition/summary",
    auth,
    requireAdmin(ctx),
    async (_req, res) => {
      try {
        const rows = await mysqlQuery(`
          SELECT
            ref,
            SUM(scans)   AS scans,
            SUM(signups) AS signups,
            MIN(first_scan) AS first_scan,
            MAX(last_scan)  AS last_scan
          FROM (
            SELECT
              ref,
              COUNT(*)        AS scans,
              0               AS signups,
              MIN(scanned_at) AS first_scan,
              MAX(scanned_at) AS last_scan
            FROM acquisition_scans
            GROUP BY ref
            UNION ALL
            SELECT
              acq_ref AS ref,
              0       AS scans,
              COUNT(*) AS signups,
              NULL    AS first_scan,
              NULL    AS last_scan
            FROM tradesmen
            WHERE acq_ref IS NOT NULL AND acq_ref <> ''
            GROUP BY acq_ref
          ) merged
          GROUP BY ref
          ORDER BY scans DESC, signups DESC
        `);

        const items = (rows || []).map((r) => {
          const scans = Number(r.scans || 0);
          const signups = Number(r.signups || 0);
          const conversion = scans > 0 ? signups / scans : null;
          return {
            ref: r.ref,
            scans,
            signups,
            conversion,
            firstScan: r.first_scan,
            lastScan: r.last_scan,
          };
        });

        res.json({ items });
      } catch (e) {
        res.status(500).json({
          error: "internal_error",
          message: e?.message || "query failed",
        });
      }
    }
  );
};
