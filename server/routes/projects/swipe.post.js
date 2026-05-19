// server/routes/projects/swipe.post.js
//
// POST /api/projects/:id/swipe
// Body: { builderUid, direction: 'right' | 'left', source: 'recommended' | 'subscribed' }
// Upserts a swipe_interest row for the (project, builder) pair.

const { fireMatchFormed } = require("../../lib/fireMatchFormed");
const { resolveGhostNotificationTarget } = require("../../lib/ghostTradesman");

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
    if (
      source !== "recommended" &&
      source !== "subscribed" &&
      source !== "paid_unlock"
    ) {
      return res.status(400).json({
        error: "source must be 'recommended', 'subscribed', or 'paid_unlock'",
      });
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

    // Read the existing row's source + homeowner_swiped_at BEFORE
    // upserting so we can (a) branch on source for the
    // paid_unlock_passed trade notification below, and (b) detect the
    // "homeowner just transitioned from not-swiped to swiped" case for
    // match formation. If no row exists yet, the homeowner is
    // initiating - source is whatever the frontend sent and
    // homeowner_swiped_at was effectively null.
    const existing = await mysqlQuery(
      `SELECT source, homeowner_swiped_at FROM swipe_interest
        WHERE project_id = ? AND builder_uid = ?
        LIMIT 1`,
      [pid, builderUid],
    );
    const existingSource = existing?.[0]?.source || null;
    const homeownerSwipedBefore = existing?.[0]?.homeowner_swiped_at != null;
    const effectiveSource = existingSource || source;

    // Terminal states are sticky - see swipe.post.js for tradesman side
    // for the symmetric race-condition fix. Source is preserved on update
    // so a homeowner left-swipe doesn't clobber a paid_unlock row's
    // origin tag.
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
         homeowner_swiped_at = VALUES(homeowner_swiped_at)`,
      [pid, uid, builderUid, source, status],
    );

    // Trade notification when a paid_unlock card is left-swiped by the
    // homeowner. Their boost slot is consumed - we owe them a polite
    // signal so silence isn't the answer.
    if (direction === "left" && effectiveSource === "paid_unlock") {
      try {
        const ownerRows = await mysqlQuery(
          `SELECT firstName FROM users WHERE uid = ? LIMIT 1`,
          [uid],
        );
        const homeownerFirst = ownerRows?.[0]?.firstName || "The homeowner";
        const projRows = await mysqlQuery(
          `SELECT name FROM projects WHERE id = ? LIMIT 1`,
          [pid],
        );
        const projectName = projRows?.[0]?.name || "the project";
        const notifMessage = `${homeownerFirst} passed on your unlock for "${projectName}"`;
        const builderNotifyUid = await resolveGhostNotificationTarget(
          mysqlQuery,
          builderUid,
        );
        await mysqlQuery(
          `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
           VALUES (?, 'paid_unlock_passed', ?, ?, ?, NOW())`,
          [builderNotifyUid, notifMessage, pid, "/tradesman/jobs"],
        );
        ctx.broadcastNotification?.(builderNotifyUid, {
          type: "paid_unlock_passed",
          message: notifMessage,
          projectId: pid,
          linkPath: "/tradesman/jobs",
        });
      } catch (notifErr) {
        // Notification failure shouldn't block the swipe response.
        const log = ctx.log || console;
        log.warn?.(`paid_unlock_passed notification failed`, {
          err: notifErr?.message,
        });
      }
    }

    // Trade notification when the homeowner is the FIRST mover - i.e.
    // the homeowner just right-swiped on a subscribed OR recommended
    // trade who hasn't seen this job yet. Without this, the trade has
    // no signal to open /tradesman/leads and swipe back, so the row
    // sits in 'waiting' forever.
    //
    // Skip for paid_unlock — those rows are inserted with status='matched'
    // by activate-unlock.post.js (the trade has already paid + swiped),
    // so the homeowner's right-swipe is the SECOND mover, not the first.
    // Match formation handles the notifications for that case below.
    if (
      direction === "right" &&
      !existingSource &&
      (source === "subscribed" || source === "recommended")
    ) {
      try {
        const ownerRows = await mysqlQuery(
          `SELECT firstName FROM users WHERE uid = ? LIMIT 1`,
          [uid],
        );
        const homeownerFirst = ownerRows?.[0]?.firstName || "A homeowner";
        const projRows = await mysqlQuery(
          `SELECT name FROM projects WHERE id = ? LIMIT 1`,
          [pid],
        );
        const projectName = projRows?.[0]?.name || "a project";
        const notifMessage = `${homeownerFirst} is interested in your services for "${projectName}"`;
        const builderNotifyUid = await resolveGhostNotificationTarget(
          mysqlQuery,
          builderUid,
        );
        await mysqlQuery(
          `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
           VALUES (?, 'homeowner_swiped', ?, ?, ?, NOW())`,
          [builderNotifyUid, notifMessage, pid, "/tradesman/leads"],
        );
        ctx.broadcastNotification?.(builderNotifyUid, {
          type: "homeowner_swiped",
          message: notifMessage,
          projectId: pid,
          linkPath: "/tradesman/leads",
        });
      } catch (notifErr) {
        const log = ctx.log || console;
        log.warn?.(`homeowner_swiped notification failed`, {
          err: notifErr?.message,
        });
      }
    }

    // Match formation: fires when the homeowner has just transitioned
    // from "not yet swiped" to "swiped right", and the builder has
    // also swiped right (or is a ghost — see below). The homeowner
    // transition is determined from `homeownerSwipedBefore` (read
    // before the upsert), so we don't double-fire on repeat right-
    // swipes from the homeowner. Status alone is unreliable here:
    // paid_unlock rows arrive with status='matched' (from
    // activate-unlock.post.js) but a NULL homeowner_swiped_at — they
    // still need fireMatchFormed when the homeowner reciprocates.
    //
    // Ghost shortcut: when the builder is a staging-only ghost
    // (master_uid IS NOT NULL) we treat the homeowner's right-swipe as
    // mutually consensual without waiting for the master to manually
    // swipe back as the persona. This is what lets friends-and-family
    // testers experience the matched-then-chat flow end-to-end.
    if (direction === "right" && !homeownerSwipedBefore) {
      const rowCheck = await mysqlQuery(
        `SELECT si.status,
                si.builder_swiped_at,
                t.master_uid AS builderMasterUid
           FROM swipe_interest si
           LEFT JOIN tradesmen t ON t.user_id = si.builder_uid
          WHERE si.project_id = ? AND si.builder_uid = ?
          LIMIT 1`,
        [pid, builderUid],
      );
      const cur = rowCheck?.[0];
      const builderSwiped = cur?.builder_swiped_at != null;
      const builderIsGhost = !!cur?.builderMasterUid;
      if (builderSwiped || builderIsGhost) {
        if (builderIsGhost && !builderSwiped) {
          // Backfill builder_swiped_at on the ghost row so the chat /
          // inbox queries that key off this column don't see a half-set
          // match. Use NOW() rather than passing a timestamp so the DB
          // clock owns it.
          await mysqlQuery(
            `UPDATE swipe_interest
                SET builder_swiped_at = NOW()
              WHERE project_id = ? AND builder_uid = ?`,
            [pid, builderUid],
          );
        }
        await mysqlQuery(
          `UPDATE swipe_interest SET status = 'matched'
            WHERE project_id = ? AND builder_uid = ?`,
          [pid, builderUid],
        );
        await fireMatchFormed({ projectId: pid, mysqlQuery, ctx });
        // Look up the row id so the client can route directly into the
        // freshly-formed match (e.g. activate the inline chat panel).
        const idRow = await mysqlQuery(
          `SELECT id FROM swipe_interest
            WHERE project_id = ? AND builder_uid = ? LIMIT 1`,
          [pid, builderUid],
        );
        const matchId = idRow?.[0]?.id ?? null;
        return res.status(200).json({
          ok: true,
          status: "matched",
          matched: true,
          matchId,
        });
      }
    }

    return res.status(200).json({ ok: true, status });
  });
};
