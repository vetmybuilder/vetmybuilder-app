// server/lib/publishNotifications.js
/**
 * firePublishNotifications -- shared helper called after a project goes live.
 *
 * Fire-and-forget: callers do NOT await this function.
 *
 * @param {object} opts
 * @param {Function} opts.mysqlQuery
 * @param {object}   opts.project           - full project row (id, name, type, location, ownerUserId, createdAt)
 * @param {string}   opts.uid               - owner uid (used for logActivity)
 * @param {Function} opts.extractLocationTokens
 * @param {Function} opts.broadcastNotification
 * @param {Function} opts.logActivity
 * @param {object}   opts.log
 * @param {Function} opts.notifyMatchedTradesmen
 * @param {Function} opts.surfacePipelineTradespeople
 * @param {object}   [opts.db]              - legacy notifyUsers db handle
 * @param {Function} [opts.notifyUsers]     - legacy SSE/email notifier
 */
const { sendPushToUser } = require("./pushSender");
const { getBoroughCodes } = require("./boroughPostcodes");

async function firePublishNotifications({
  mysqlQuery,
  project,
  uid,
  extractLocationTokens,
  broadcastNotification,
  logActivity,
  log,
  notifyMatchedTradesmen,
  surfacePipelineTradespeople,
  db,
  notifyUsers,
}) {
  const id = project.id;

  // ---- Notify matched tradesmen (fire-and-forget) ----
  notifyMatchedTradesmen({
    mysqlQuery,
    projectId: id,
    sseBroadcast: broadcastNotification,
    projectName: project.name,
    projectType: project.type,
    projectLocation: project.location,
    projectCreatedAt: project.createdAt,
    log,
  }).catch((err) => {
    log.warn?.("[publishNotifications] notifyMatchedTradesmen error", err);
  });

  // ---- Surface pipeline tradespeople (fire-and-forget) ----
  log.info?.("[publishNotifications] calling surfacePipelineTradespeople", {
    id,
    type: project.type,
    location: project.location,
  });
  surfacePipelineTradespeople({
    mysqlQuery,
    projectId: id,
    projectType: project.type,
    projectName: project.name,
    projectLocation: project.location,
    broadcastNotification,
    logActivity,
  }).catch((err) => {
    log.warn?.("[publishNotifications] surfacePipelineTradespeople error", {
      err: err?.message,
      stack: err?.stack,
    });
  });

  // ---- Local-area homeowner notifications ----
  try {
    const locTokens = extractLocationTokens(project.location);
    log.info?.("[publishNotifications] locTokens", { id, locTokens });

    const whereParts = [];
    const areaParams = [];

    if (locTokens.full) {
      whereParts.push("u.postcode = ?");
      areaParams.push(locTokens.full);
    }
    if (locTokens.sector) {
      whereParts.push("u.postcodeSector = ?");
      areaParams.push(locTokens.sector);
    }
    if (locTokens.outward) {
      // Expand to all postcodes in the same borough
      const boroughCodes = getBoroughCodes(locTokens.outward);
      for (const code of boroughCodes) {
        whereParts.push("u.postcodeOutward = ?");
        areaParams.push(code);
      }
    }
    if (locTokens.city) {
      whereParts.push("LOWER(u.city) = ?");
      areaParams.push(String(locTokens.city).toLowerCase());
    }

    if (!whereParts.length) {
      log.warn?.(
        "[publishNotifications] no location tokens extracted; skipping notifications",
        { id }
      );
      return;
    }

    const areaWhere = whereParts.join(" OR ");

    // ---- Local users ----
    let areaUsers = [];
    try {
      const areaUserRows = await mysqlQuery(
        `SELECT u.uid AS uid
           FROM users u
          WHERE (${areaWhere})
            AND u.uid <> ?`,
        [...areaParams, project.ownerUserId]
      );

      areaUsers = areaUserRows
        .map((r) => (r && r.uid ? String(r.uid) : null))
        .filter(Boolean);

      log.info?.("[publishNotifications] areaUsers", {
        id,
        count: areaUsers.length,
      });
    } catch (err) {
      log.warn?.("[publishNotifications] areaUsers load error", err);
    }

    // ---- Prior recommenders in area ----
    let recUsers = [];
    try {
      const recUserRows = await mysqlQuery(
        `SELECT DISTINCT r.recommenderUserId AS uid
           FROM recommendations r
           JOIN users u ON u.uid = r.recommenderUserId
          WHERE r.projectId = ?
            AND r.recommenderUserId IS NOT NULL
            AND (${areaWhere})
            AND r.recommenderUserId <> ?`,
        [id, ...areaParams, project.ownerUserId]
      );

      recUsers = recUserRows
        .map((r) => (r && r.uid ? String(r.uid) : null))
        .filter(Boolean);

      log.info?.("[publishNotifications] recUsers", {
        id,
        count: recUsers.length,
      });
    } catch (err) {
      log.warn?.("[publishNotifications] recUsers load error", err);
    }

    const targets = Array.from(new Set([...areaUsers, ...recUsers]));
    log.info?.("[publishNotifications] notification targets", {
      id,
      count: targets.length,
    });

    if (!targets.length) return;

    // ---- Build notification ----
    const message = `A new job "${project.name}" in your area is now live`;
    const linkPath = `/projects/${id}`;
    const createdAt = new Date();

    // ---- Insert notifications into MySQL ----
    let inserted = 0;
    try {
      for (const targetUid of targets) {
        await mysqlQuery(
          `INSERT INTO notifications
             (userId, type, message, projectId, linkPath, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [targetUid, "project_live_local", message, id, linkPath, createdAt]
        );
        broadcastNotification?.(targetUid, {
          type: "project_live_local",
          message,
          projectId: id,
          linkPath,
        });

        sendPushToUser({
          uid: targetUid,
          type: "project_live_local",
          title: "VetMyBuilder",
          body: message,
          linkPath,
          mysqlQuery,
          logActivity,
        });

        inserted++;
      }
      log.info?.("[publishNotifications] notifications inserted", {
        id,
        count: inserted,
      });
    } catch (err) {
      log.warn?.("[publishNotifications] MySQL notification insert error", err);
    }

    // ---- Legacy notifyUsers (SSE/email) ----
    if (typeof notifyUsers === "function" && db && targets.length) {
      try {
        notifyUsers(db, targets, {
          type: "project_live_local",
          message,
          projectId: id,
          linkPath,
        });
      } catch (err) {
        log.warn?.("[publishNotifications] notifyUsers legacy error", err);
      }
    }

    log.info?.("[publishNotifications] done", { id });
  } catch (err) {
    log.error?.("[publishNotifications] background notify error", err);
  }
}

module.exports = { firePublishNotifications };
