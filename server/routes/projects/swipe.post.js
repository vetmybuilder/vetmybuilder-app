// server/routes/projects/swipe.post.js
//
// POST /api/projects/:id/swipe
// Body: { builderUid, direction: 'right' | 'left', source: 'recommended' | 'subscribed' }
// Upserts a swipe_interest row for the (project, builder) pair.

const { fireMatchFormed } = require("../../lib/fireMatchFormed");

module.exports = function mountSwipe(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post("/projects/:id/swipe", auth, async (req, res) => {
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

    // Terminal states are sticky - see swipe.post.js for tradesman side
    // for the symmetric race-condition fix.
    await mysqlQuery(
      `INSERT INTO swipe_interest
         (project_id, homeowner_uid, builder_uid, source, status,
          homeowner_swiped_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         status = CASE
           WHEN status IN ('declined_by_homeowner','declined_by_builder','matched','expired')
             THEN status
           ELSE VALUES(status)
         END,
         source = VALUES(source),
         homeowner_swiped_at = VALUES(homeowner_swiped_at)`,
      [pid, uid, builderUid, source, status],
    );

    // Match formation: only when current row state is 'pending' and the
    // builder has actually swiped right (builder_swiped_at non-null AND
    // status is pending - timestamp alone isn't enough since the builder
    // could have left-swiped, which also sets the timestamp).
    if (direction === "right") {
      const rowCheck = await mysqlQuery(
        `SELECT status, builder_swiped_at FROM swipe_interest
          WHERE project_id = ? AND builder_uid = ?
          LIMIT 1`,
        [pid, builderUid],
      );
      const cur = rowCheck?.[0];
      const builderSwiped = cur?.builder_swiped_at != null;
      const isPending = cur?.status === "pending";
      if (isPending && builderSwiped) {
        await mysqlQuery(
          `UPDATE swipe_interest SET status = 'matched'
            WHERE project_id = ? AND builder_uid = ?`,
          [pid, builderUid],
        );
        await fireMatchFormed({ projectId: pid, mysqlQuery, ctx });
        return res.status(200).json({ ok: true, status: "matched", matched: true });
      }
    }

    return res.status(200).json({ ok: true, status });
  });
};
