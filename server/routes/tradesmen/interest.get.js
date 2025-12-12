// server/routes/tradesmen/interest.get.js

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, requireTradesman = null } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/interest.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  log.info?.(`${TAG} mounted`);

  router.get(
    "/tradesmen/interest",
    auth,
    maybe(requireTradesman),
    async (req, res) => {
      const uid = req.user?.uid;
      const projectId = Number(req.query.projectId);

      log.info?.(`${TAG} request`, { uid, projectId });

      try {
        if (!uid) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        if (!Number.isFinite(projectId)) {
          return res.status(400).json({ error: "projectId is required" });
        }

        // new flow
        let share = null;
        try {
          const rows = await mysqlQuery(
            `SELECT id FROM trade_shares WHERE project_id=? AND tradesman_uid=? LIMIT 1`,
            [projectId, uid]
          );
          share = rows[0] || null;
        } catch (e) {
          log.warn?.(`${TAG} trade_shares lookup failed`, {
            error: e?.message,
          });
        }

        if (share) {
          log.info?.(`${TAG} share found`, { shareId: share.id });
          return res.json({
            ok: true,
            shared: true,
            shareId: Number(share.id),
            linkPath: `/projects/${projectId}/shares`,
          });
        }

        // legacy
        let legacy = null;
        try {
          const rows = await mysqlQuery(
            `SELECT recommendationId FROM tradesman_interests WHERE projectId=? AND fromUid=? LIMIT 1`,
            [projectId, uid]
          );
          legacy = rows[0] || null;
        } catch (e) {
          log.warn?.(`${TAG} legacy table lookup failed`, {
            error: e?.message,
          });
        }

        if (!legacy) {
          log.info?.(`${TAG} no share found`);
          return res.json({ ok: true, shared: false });
        }

        log.info?.(`${TAG} legacy share found`, {
          recommendationId: legacy.recommendationId,
        });

        return res.json({
          ok: true,
          shared: true,
          recommendationId: Number(legacy.recommendationId),
          linkPath: `/builders/${legacy.recommendationId}`,
        });
      } catch (e) {
        log.error?.(`${TAG} error`, { error: e?.message });
        return res.status(500).json({ error: "Failed to load interest state" });
      }
    }
  );
};

function maybe(fn) {
  return typeof fn === "function" ? fn : (_req, _res, next) => next();
}
