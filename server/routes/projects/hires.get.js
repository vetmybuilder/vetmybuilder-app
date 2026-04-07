// server/routes/projects/hires.get.js
//
// GET /api/projects/:projectId/hires
//
// Auth: required (project owner only)
// Returns all hires the homeowner has made for the project, newest first.
// Powers the "Hired tradesmen" section on the homeowner's project page.
//
// Unlike the create endpoint, this works for any project status — the owner
// should still see hire history if the project is later archived or closed.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[projects/hires.get]";
  const ROUTE = "/projects/:projectId/hires";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // Same shape as the spotlight route's helper. Used to surface absolute
  // tradesman avatar URLs to the client.
  const makeAbsolute = (url) => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;

    const base =
      process.env.MEDIA_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "";

    if (!base) return url.startsWith("/") ? url : `/${url}`;
    return `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  };

  router.get(ROUTE, auth, async (req, res) => {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    try {
      const projRows = await mysqlQuery(
        `SELECT id, ownerUserId
           FROM projects
          WHERE id = ?
          LIMIT 1`,
        [projectId],
      );
      const project = projRows[0];

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (String(project.ownerUserId) !== String(uid)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const rows = await mysqlQuery(
        `
        SELECT
          h.id,
          h.projectId,
          h.tradesmanUserId,
          h.recommendationId,
          h.invitedCompanyName,
          h.inviteChannel,
          h.status,
          h.homeownerMessage,
          h.tradesmanMessage,
          h.cancelReason,
          h.hiredAt,
          h.respondedAt,
          h.cancelledAt,
          h.expiresAt,

          t.company_name        AS tradesmanCompanyName,
          t.contact_name        AS tradesmanContactName,
          t.profile_picture_url AS tradesmanProfilePictureUrl

        FROM hires h
        LEFT JOIN tradesmen t
               ON t.user_id = h.tradesmanUserId
        WHERE h.projectId = ?
        ORDER BY h.hiredAt DESC, h.id DESC
        `,
        [projectId],
      );

      const items = rows.map((r) => {
        const displayName =
          r.tradesmanCompanyName ||
          r.tradesmanContactName ||
          r.invitedCompanyName ||
          "Tradesman";

        return {
          id: r.id,
          projectId: r.projectId,
          tradesmanUserId: r.tradesmanUserId,
          recommendationId: r.recommendationId,
          status: r.status,
          homeownerMessage: r.homeownerMessage,
          tradesmanMessage: r.tradesmanMessage,
          cancelReason: r.cancelReason,
          hiredAt: r.hiredAt,
          respondedAt: r.respondedAt,
          cancelledAt: r.cancelledAt,
          expiresAt: r.expiresAt,

          displayName,
          tradesmanCompanyName: r.tradesmanCompanyName || null,
          invitedCompanyName: r.invitedCompanyName || null,
          inviteChannel: r.inviteChannel || null,
          tradesmanAvatarUrl: makeAbsolute(r.tradesmanProfilePictureUrl),
        };
      });

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

  if (!ctx.__logged_hires_get) {
    ctx.__logged_hires_get = true;
    log.info?.(`[routes] mounted: GET /api${ROUTE}`);
  }
};
