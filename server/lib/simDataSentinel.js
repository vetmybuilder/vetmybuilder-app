// server/lib/simDataSentinel.js
//
// Runtime guard against simulator data leaking into production.
//
// Background (April 2026): the local-dev simulator (scripts/simulate.js)
// ran on production for ~10 days under PM2 as `sim-daemon`, generating
// ~£100 of Google Places API spend by repeatedly creating fake tradesmen
// (`sim-builder-NNN`, `sim-neighbour-NNN`, `lead_*`) and triggering the
// enrichment pipeline. After cleanup we added:
//
//   1. A hard prod-refusal guard at the top of scripts/simulate.js +
//      scripts/dev-manual-sim.js — refuses to start when
//      NODE_ENV=production unless a magic-string override is set.
//
//   2. THIS sentinel — runs on server boot. If we are in production and
//      sim-style rows are found in the database, we log a loud warning.
//      Doesn't crash the server (we don't want to fail healthchecks if
//      the cleanup is partial), but the warning will be unmissable in
//      Pino's structured output.
//
// We check three lightweight indicators:
//   - tradesmen rows with `user_id` starting `sim-` or `lead_`
//   - users rows with `uid` starting `sim-`
//   - projects rows with `ownerUserId` starting `sim-` or `lead_`
//
// All swallowed on error so a transient DB issue at boot can't take the
// process down.

async function checkProdForSimData({ mysqlQuery, log = console } = {}) {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof mysqlQuery !== "function") return;

  try {
    const rows = await mysqlQuery(
      `
      SELECT 'tradesmen' AS tbl,
             SUM(user_id LIKE 'sim-%' OR user_id LIKE 'lead_%') AS hits
      FROM tradesmen
      UNION ALL
      SELECT 'users',
             SUM(uid LIKE 'sim-%') AS hits
      FROM users
      UNION ALL
      SELECT 'projects',
             SUM(ownerUserId LIKE 'sim-%' OR ownerUserId LIKE 'lead_%' OR ownerUserId LIKE 'sim-neighbour%') AS hits
      FROM projects
      `,
    );

    const offenders = (rows || []).filter((r) => Number(r.hits) > 0);
    if (offenders.length === 0) {
      log.info?.(
        { module: "simDataSentinel" },
        "[sim-sentinel] OK - no simulator data detected in production database",
      );
      return;
    }

    const summary = offenders
      .map((r) => `${r.tbl}=${r.hits}`)
      .join(", ");

    log.warn?.(
      {
        module: "simDataSentinel",
        offenders,
      },
      `[sim-sentinel] WARNING - simulator data found in production: ${summary}. Run the cleanup queries from the April 2026 incident note.`,
    );
  } catch (e) {
    // Don't take the server down on a sentinel failure - just log.
    log.warn?.(
      { module: "simDataSentinel", error: e?.message || String(e) },
      "[sim-sentinel] check failed - skipping",
    );
  }
}

module.exports = { checkProdForSimData };
