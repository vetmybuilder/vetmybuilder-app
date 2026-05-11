// server/routes/projects/matched-tradespeople.get.js
//
// GET /api/projects/:id/matched-tradespeople
// Auth: owner of the project.
//
// Returns tradespeople who matched with the homeowner on this project via the
// swipe deck (swipe_interest.status = 'matched'). Used by the close-project
// flow so a homeowner can credit a matched tradesperson as the winner even
// when there is no rec / shared profile.
//
// Response shape mirrors /api/tradesmen/shares so the client can merge results
// without per-endpoint adapters:
//   { matches: [{ tradesmanUid, companyName, primaryPhotoUrl, ... }], total }

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[projects/matched-tradespeople.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get("/projects/:id/matched-tradespeople", auth, async (req, res) => {
    const uid = req.user?.uid || req.user?.id;
    const projectId = Number(req.params.id);

    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "invalid_id" });
    }

    try {
      const owned = await mysqlQuery(
        "SELECT id FROM projects WHERE id = ? AND ownerUserId = ? LIMIT 1",
        [projectId, String(uid)],
      );
      if (!owned || owned.length === 0) {
        return res.status(403).json({ error: "forbidden" });
      }

      const rows = await mysqlQuery(
        `SELECT
           si.id                          AS match_id,
           si.builder_uid                 AS tradesman_uid,
           t.company_name                 AS company_name,
           t.profile_picture_url          AS profile_picture_url,
           u.firstName                    AS first_name
         FROM swipe_interest si
         LEFT JOIN tradesmen t ON t.user_id = si.builder_uid
         LEFT JOIN users u     ON u.uid     = si.builder_uid
         WHERE si.project_id = ?
           AND si.status = 'matched'
         ORDER BY si.updated_at DESC, si.id DESC`,
        [projectId],
      );

      const matches = rows.map((r) => ({
        matchId: r.match_id,
        tradesmanUid: r.tradesman_uid,
        companyName: r.company_name || null,
        tradesmanName: r.first_name || null,
        primaryPhotoUrl: r.profile_picture_url || null,
      }));

      return res.json({ matches, total: matches.length });
    } catch (e) {
      log.error?.(`${TAG} failed`, { error: e?.message, stack: e?.stack });
      return res.status(500).json({
        error: "MATCHED_TRADESPEOPLE_FETCH_FAILED",
        message: e?.message || String(e),
      });
    }
  });
};
