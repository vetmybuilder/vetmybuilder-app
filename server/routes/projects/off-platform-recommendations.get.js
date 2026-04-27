// server/routes/projects/off-platform-recommendations.get.js
//
// GET /api/projects/:id/off-platform-recommendations
// Owner-only. Returns recs for the project that don't have a linked
// tradesman (i.e. the recommended builder isn't on VMB yet). Each row is
// enriched with the recommender's first name, the per-category ratings,
// and the invite state for nudge UI.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const toIntOrNull = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  };

  router.get("/projects/:id/off-platform-recommendations", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const pid = Number(req.params.id);
    if (!Number.isFinite(pid) || pid <= 0) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const projRows = await mysqlQuery(
      `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
      [pid],
    );
    const proj = projRows?.[0];
    if (!proj) return res.status(404).json({ error: "Project not found" });
    if (String(proj.ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "Not your project" });
    }

    const rows = await mysqlQuery(
      `SELECT
         r.id,
         r.company,
         r.comment,
         r.createdAt,
         r.quality_rating,
         r.reliability_rating,
         r.communication_rating,
         r.trust_rating,
         r.value_rating,
         r.isAnonymous,
         u.firstName AS recommenderFirstName,
         i.sentToEmail,
         i.emailSentAt,
         i.nudgeCount,
         i.lastNudgedAt
       FROM recommendations r
       LEFT JOIN users u ON u.uid = r.recommenderUserId
       LEFT JOIN recommendation_invites i ON i.recommendationId = r.id
       WHERE r.projectId = ?
         AND r.linked_tradesman_uid IS NULL
       ORDER BY r.createdAt DESC`,
      [pid],
    );

    const items = (rows || []).map((row) => ({
      id: row.id,
      company: row.company,
      comment: row.comment,
      createdAt: row.createdAt,
      ratings: {
        quality: toIntOrNull(row.quality_rating),
        reliability: toIntOrNull(row.reliability_rating),
        communication: toIntOrNull(row.communication_rating),
        trust: toIntOrNull(row.trust_rating),
        value: toIntOrNull(row.value_rating),
      },
      recommender: {
        name: row.isAnonymous ? "Anonymous" : (row.recommenderFirstName || "Guest"),
      },
      invite: {
        sent: !!row.emailSentAt,
        sentToEmail: row.sentToEmail || null,
        emailSentAt: row.emailSentAt || null,
        nudgeCount: Number(row.nudgeCount || 0),
        lastNudgedAt: row.lastNudgedAt || null,
      },
    }));

    return res.json({ items });
  });
};
