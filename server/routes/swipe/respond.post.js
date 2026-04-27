// server/routes/swipe/respond.post.js
//
// POST /api/swipe-interest/:id/respond
// Body: { direction: 'right' | 'left' }

const {
  isBuilderSubscribed,
} = require("../../lib/subscriptions/isBuilderSubscribed");
const { sendPushToUser } = require("../../lib/pushSender");

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

    if (newStatus === "matched") {
      try {
        const detailRows = await mysqlQuery(
          `SELECT p.id AS projectId, p.name AS projectName, p.ownerUserId,
                  t.user_id AS tradesmanUid, t.company_name AS tradesmanName
             FROM swipe_interest si
             JOIN projects p ON p.id = si.project_id
             JOIN tradesmen t ON t.user_id = si.builder_uid
            WHERE si.id = ? LIMIT 1`,
          [siId],
        );
        const detail = detailRows?.[0];
        if (detail) {
          const linkPath = `/projects/${detail.projectId}`;
          const homeownerMessage = `🎉 You matched with ${detail.tradesmanName} on "${detail.projectName}"`;
          const tradesmanMessage = `🎉 You matched with a homeowner on "${detail.projectName}"`;

          // Insert + push for homeowner
          await mysqlQuery(
            `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, 'match_formed', ?, ?, ?, NOW())`,
            [detail.ownerUserId, homeownerMessage, detail.projectId, linkPath],
          );
          ctx.broadcastNotification?.(detail.ownerUserId, {
            type: "match_formed", message: homeownerMessage, projectId: detail.projectId, linkPath,
          });
          sendPushToUser({
            uid: detail.ownerUserId,
            type: "match_formed",
            title: "VetMyBuilder",
            body: homeownerMessage,
            linkPath,
            mysqlQuery,
            logActivity: ctx.logActivity,
          });

          // Insert + push for tradesman
          await mysqlQuery(
            `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, 'match_formed', ?, ?, ?, NOW())`,
            [detail.tradesmanUid, tradesmanMessage, detail.projectId, linkPath],
          );
          ctx.broadcastNotification?.(detail.tradesmanUid, {
            type: "match_formed", message: tradesmanMessage, projectId: detail.projectId, linkPath,
          });
          sendPushToUser({
            uid: detail.tradesmanUid,
            type: "match_formed",
            title: "VetMyBuilder",
            body: tradesmanMessage,
            linkPath: `/tradesman/projects`,
            mysqlQuery,
            logActivity: ctx.logActivity,
          });
        }
      } catch (err) {
        console.warn("[swipe.respond] match_formed notification failed:", err?.message);
      }
    }

    return res.status(200).json({ ok: true, status: newStatus });
  });
};
