// server/routes/__test__/sim/live-projects.get.js
/**
 * GET /api/__test__/sim/live-projects
 *
 * Returns all currently-live project IDs so the sim daemon can discover
 * newly published projects without needing direct DB access.
 *
 * Protected by X-Test-Secret — only available when ENABLE_TEST_ROUTES=1.
 */

module.exports = (router, ctx) => {
  const { assertTestAccess, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const ROUTE = "/__test__/sim/live-projects";

  router.get(ROUTE, async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    try {
      const rows = await mysqlQuery(
        `SELECT id, status, createdAt FROM projects WHERE status = 'live' ORDER BY createdAt DESC`
      );
      return res.json({ items: rows });
    } catch (e) {
      log.error?.(`[sim/live-projects] error: ${e.message}`);
      return res.status(500).json({ error: e.message });
    }
  });
};
