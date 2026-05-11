// server/lib/publishNotifications.js
/**
 * firePublishNotifications -- shared helper called after a project goes live.
 *
 * Fire-and-forget: callers do NOT await this function.
 *
 * @param {object} opts
 * @param {Function} opts.mysqlQuery
 * @param {object}   opts.project           - full project row (id, name, type, location, ownerUserId, createdAt)
 * @param {Function} opts.broadcastNotification
 * @param {Function} opts.broadcastEvent
 * @param {Function} opts.logActivity
 * @param {object}   opts.log
 * @param {Function} opts.notifyMatchedTradesmen
 * @param {Function} opts.surfacePipelineTradespeople
 */
async function firePublishNotifications({
  mysqlQuery,
  project,
  broadcastNotification,
  broadcastEvent,
  logActivity,
  log,
  notifyMatchedTradesmen,
  surfacePipelineTradespeople,
}) {
  const id = project.id;

  // ---- Notify matched tradesmen (fire-and-forget) ----
  notifyMatchedTradesmen({
    mysqlQuery,
    projectId: id,
    sseBroadcast: broadcastNotification,
    broadcastEvent,
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

  // ---- project_live_local notifications removed entirely ----
  // We previously notified (a) every homeowner in the same area, then
  // narrowed to (b) past recommenders only. Both proved to be noise:
  // homeowners don't care about other homeowners' jobs, and pinging past
  // recommenders on every new local job spammed them. Tradespeople still
  // get matched-job notifications via notifyMatchedTradesmen above, which
  // is the only audience that should be touched on project-live.
  log.info?.("[publishNotifications] done", { id });
}

module.exports = { firePublishNotifications };
