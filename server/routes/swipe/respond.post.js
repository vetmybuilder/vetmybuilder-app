// server/routes/swipe/respond.post.js
//
// POST /api/swipe-interest/:id/respond
// Body: { direction: 'right' | 'left' }

const {
  isBuilderSubscribed,
} = require("../../lib/subscriptions/isBuilderSubscribed");

module.exports = function mountRespond(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post("/swipe-interest/:id/respond", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const siId = Number(req.params.id);
    if (!Number.isFinite(siId) || siId <= 0) {
      return res.status(400).json({ error: "Invalid swipe-interest id" });
    }
    const direction = req.body?.direction;
    if (direction !== "right" && direction !== "left") {
      return res
        .status(400)
        .json({ error: "direction must be 'right' or 'left'" });
    }

    const rows = await mysqlQuery(
      `SELECT id, builder_uid, project_id, source, status
         FROM swipe_interest
        WHERE id = ? AND builder_uid = ?
        LIMIT 1`,
      [siId, uid],
    );
    const row = rows?.[0];
    if (!row) {
      return res
        .status(404)
        .json({ error: "swipe_interest not found or not yours" });
    }
    if (row.status !== "pending") {
      return res
        .status(409)
        .json({ error: `cannot respond to status=${row.status}` });
    }

    if (direction === "right" && row.source === "subscribed") {
      const ok = await isBuilderSubscribed(uid, mysqlQuery);
      if (!ok) {
        return res.status(403).json({
          error: "active subscription required to accept a subscribed match",
        });
      }
    }

    const newStatus = direction === "right" ? "matched" : "declined_by_builder";

    await mysqlQuery(
      `UPDATE swipe_interest
          SET status = ?,
              builder_swiped_at = NOW()
        WHERE id = ?`,
      [newStatus, siId],
    );

    return res.status(200).json({ ok: true, status: newStatus });
  });
};
