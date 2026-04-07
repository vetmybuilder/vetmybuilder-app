// server/routes/tradesmen/me.hires.get.js
//
// GET /api/tradesmen/me/hires
//
// Auth: required (tradesman role only — uses requireTradesman guard)
// Returns all hire requests assigned to the calling tradesman, newest first.
// Powers the "Hire requests" section in the tradesman dashboard.
//
// Includes hires in every status (pending, accepted, declined, cancelled,
// expired) so the dashboard UI can group/filter them client-side without
// extra requests.
//
// Project context surfaced for each hire:
//   - basic project fields (name, location, type, propertyType, bedrooms)
//   - the homeowner's first name (no email or surname — privacy)
//   - completedProjectsCount: total completed projects the homeowner has on
//     the platform — used as a trust signal in the UI ("homeowner has X
//     completed projects on VetMyBuilder")

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/me.hires.get]";
  const ROUTE = "/tradesmen/me/hires";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // Resolved lazily so the constructor doesn't throw if ctx isn't fully built
  const requireTradesman = ctx.requireTradesman;
  if (!requireTradesman) {
    throw new Error("ctx.requireTradesman not attached");
  }

  router.get(ROUTE, auth, requireTradesman, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    try {
      const rows = await mysqlQuery(
        `
        SELECT
          h.id,
          h.projectId,
          h.status,
          h.homeownerMessage,
          h.tradesmanMessage,
          h.hiredAt,
          h.respondedAt,
          h.expiresAt,

          p.name          AS project_name,
          p.location      AS project_location,
          p.type          AS project_type,
          p.propertyType  AS project_propertyType,
          p.bedrooms      AS project_bedrooms,
          p.ownerUserId   AS project_ownerUid,

          u.firstName     AS owner_firstName

        FROM hires h
        JOIN projects p ON p.id = h.projectId
        LEFT JOIN users u ON u.uid = p.ownerUserId
        WHERE h.tradesmanUserId = ?
        ORDER BY h.hiredAt DESC, h.id DESC
        `,
        [uid],
      );

      // Cache completed counts per homeowner so we don't run the same query
      // many times for hires from the same person
      const completedCache = new Map();
      const getCompletedCount = async (ownerUid) => {
        if (!ownerUid) return 0;
        if (completedCache.has(ownerUid)) return completedCache.get(ownerUid);
        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
             FROM projects
            WHERE ownerUserId = ? AND LOWER(status) = 'completed'`,
          [ownerUid],
        );
        const c = Number(countRows?.[0]?.c || 0);
        completedCache.set(ownerUid, c);
        return c;
      };

      const items = [];
      for (const r of rows) {
        const completedProjectsCount = await getCompletedCount(
          r.project_ownerUid,
        );

        items.push({
          id: r.id,
          projectId: r.projectId,
          status: r.status,
          homeownerMessage: r.homeownerMessage,
          tradesmanMessage: r.tradesmanMessage,
          hiredAt: r.hiredAt,
          respondedAt: r.respondedAt,
          expiresAt: r.expiresAt,

          project: {
            id: r.projectId,
            name: r.project_name,
            location: r.project_location,
            type: r.project_type,
            propertyType: r.project_propertyType,
            bedrooms: r.project_bedrooms,
            ownerFirstName: r.owner_firstName || null,
            completedProjectsCount,
          },
        });
      }

      return res.json({
        items,
        total: items.length,
      });
    } catch (err) {
      log.error?.(`${TAG} error`, err);
      return res
        .status(500)
        .json({ error: "Internal error loading hires" });
    }
  });

  if (!ctx.__logged_me_hires_get) {
    ctx.__logged_me_hires_get = true;
    log.info?.(`[routes] mounted: GET /api${ROUTE}`);
  }
};
