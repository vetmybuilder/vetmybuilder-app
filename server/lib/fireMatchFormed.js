// server/lib/fireMatchFormed.js
//
// Fires bilateral match_formed notifications (DB row + push + SSE broadcast)
// for both the homeowner and the tradesman when a swipe match is formed.
//
// Called from:
//   - server/routes/swipe/respond.post.js   (builder accepts homeowner interest)
//   - server/routes/projects/swipe.post.js  (homeowner swipes on builder who already swiped)
//   - server/routes/tradesmen/jobs/swipe.post.js (builder swipes on job homeowner already swiped)
//
// Signature:
//   fireMatchFormed({ projectId, mysqlQuery, ctx })
//
// The swipe_interest row must already have status='matched' before calling this.
// Looks up details by joining on swipe_interest + projects + tradesmen for the given projectId.

const { sendPushToUser } = require("./pushSender");
const { resolveGhostNotificationTarget } = require("./ghostTradesman");

/**
 * @param {object} opts
 * @param {number} opts.projectId
 * @param {function} opts.mysqlQuery
 * @param {object} opts.ctx  - Express ctx (broadcastNotification, logActivity)
 */
async function fireMatchFormed({ projectId, mysqlQuery, ctx }) {
  try {
    const detailRows = await mysqlQuery(
      `SELECT si.id AS matchId, p.id AS projectId, p.name AS projectName, p.ownerUserId,
              t.user_id AS tradesmanUid, t.company_name AS tradesmanName
         FROM swipe_interest si
         JOIN projects p ON p.id = si.project_id
         JOIN tradesmen t ON t.user_id = si.builder_uid
        WHERE si.project_id = ? AND si.status = 'matched'
        LIMIT 1`,
      [projectId],
    );
    const detail = detailRows?.[0];
    if (!detail) return;

    // Homeowner notification deep-links to the project page with an
    // openChat hand-off so the bottom messaging dock pops the chat
    // window straight away (web/pages/projects/[id].tsx reads the
    // ?openChat= query and dispatches `vmb:openChat`). Skips the
    // separate /match/:matchId celebration screen for the click-through
    // path - that page still exists for the MatchCelebrationToast flow.
    const homeownerLinkPath = `/projects/${detail.projectId}?openChat=${detail.matchId}`;
    const tradesmanLinkPath = `/chat/${detail.matchId}`;
    const homeownerMessage = `🎉 You matched with ${detail.tradesmanName} on "${detail.projectName}"`;
    const tradesmanMessage = `🎉 You matched with a homeowner on "${detail.projectName}"`;

    // Insert + push for homeowner
    await mysqlQuery(
      `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
       VALUES (?, 'match_formed', ?, ?, ?, NOW())`,
      [detail.ownerUserId, homeownerMessage, detail.projectId, homeownerLinkPath],
    );
    ctx.broadcastNotification?.(detail.ownerUserId, {
      type: "match_formed",
      message: homeownerMessage,
      projectId: detail.projectId,
      linkPath: homeownerLinkPath,
    });
    sendPushToUser({
      uid: detail.ownerUserId,
      type: "match_formed",
      title: "VetMyBuilder",
      body: homeownerMessage,
      linkPath: homeownerLinkPath,
      mysqlQuery,
      logActivity: ctx.logActivity,
    });

    // Insert + push for tradesman. If the tradesman is a ghost, the
    // master operator is the one who should hear about the match.
    const tradesmanNotifyUid = await resolveGhostNotificationTarget(
      mysqlQuery,
      detail.tradesmanUid,
    );
    await mysqlQuery(
      `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
       VALUES (?, 'match_formed', ?, ?, ?, NOW())`,
      [tradesmanNotifyUid, tradesmanMessage, detail.projectId, tradesmanLinkPath],
    );
    ctx.broadcastNotification?.(tradesmanNotifyUid, {
      type: "match_formed",
      message: tradesmanMessage,
      projectId: detail.projectId,
      linkPath: tradesmanLinkPath,
    });
    sendPushToUser({
      uid: tradesmanNotifyUid,
      type: "match_formed",
      title: "VetMyBuilder",
      body: tradesmanMessage,
      linkPath: tradesmanLinkPath,
      mysqlQuery,
      logActivity: ctx.logActivity,
    });
  } catch (err) {
    console.warn("[fireMatchFormed] match_formed notification failed:", err?.message);
  }
}

module.exports = { fireMatchFormed };
