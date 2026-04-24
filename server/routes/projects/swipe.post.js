// server/routes/projects/swipe.post.js
//
// POST /api/projects/:id/swipe
// Body: { builderUid, direction: 'right' | 'left', source: 'recommended' | 'subscribed' }
// Upserts a swipe_interest row for the (project, builder) pair.

module.exports = function mountSwipe(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post("/api/projects/:id/swipe", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const pid = Number(req.params.id);
    if (!Number.isFinite(pid) || pid <= 0) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const { builderUid, direction, source } = req.body || {};
    if (!builderUid || typeof builderUid !== "string") {
      return res.status(400).json({ error: "builderUid required" });
    }
    if (direction !== "right" && direction !== "left") {
      return res
        .status(400)
        .json({ error: "direction must be 'right' or 'left'" });
    }
    if (source !== "recommended" && source !== "subscribed") {
      return res
        .status(400)
        .json({ error: "source must be 'recommended' or 'subscribed'" });
    }

    const proj = await mysqlQuery(
      `SELECT id, ownerUserId FROM projects WHERE id = ? LIMIT 1`,
      [pid],
    );
    const projectRow = proj?.[0];
    if (!projectRow) return res.status(404).json({ error: "Project not found" });
    if (String(projectRow.ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "Not your project" });
    }

    const b = await mysqlQuery(
      `SELECT user_id FROM tradesmen WHERE user_id = ? LIMIT 1`,
      [builderUid],
    );
    if (!b?.[0]) return res.status(404).json({ error: "Builder not found" });

    const status = direction === "right" ? "pending" : "declined_by_homeowner";

    await mysqlQuery(
      `INSERT INTO swipe_interest
         (project_id, homeowner_uid, builder_uid, source, status,
          homeowner_swiped_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         source = VALUES(source),
         homeowner_swiped_at = VALUES(homeowner_swiped_at)`,
      [pid, uid, builderUid, source, status],
    );

    return res.status(200).json({ ok: true, status });
  });
};
