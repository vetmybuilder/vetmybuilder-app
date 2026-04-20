// server/lib/notifyNewSignupOfLocalProjects.js
//
// Fire-and-forget: when a new homeowner signs up with a location,
// check for live projects in their area from the last 30 days and
// send up to 5 notifications so they immediately see local activity.

const { extractLocationTokens } = require("./location");
const { sendPushToUser } = require("./pushSender");
const { logger } = require("./logger");

const MAX_NOTIFICATIONS = 5;
const LOOKBACK_DAYS = 30;

/**
 * @param {object} opts
 * @param {Function} opts.mysqlQuery
 * @param {Function} [opts.broadcastNotification]
 * @param {Function} [opts.logActivity]
 * @param {string}   opts.uid — the new user's UID
 * @param {string}   opts.location — the postcode/city they signed up with
 */
async function notifyNewSignupOfLocalProjects({
  mysqlQuery,
  broadcastNotification,
  logActivity,
  uid,
  location,
}) {
  const log = logger.child({ module: "notifyNewSignupOfLocalProjects", uid });

  try {
    if (!location) return;

    const tokens = extractLocationTokens(location);

    // Match against the PROJECT's location, not the owner's home location.
    const projectWhereParts = [];
    const projectParams = [];

    if (tokens.full) {
      projectWhereParts.push("UPPER(p.location) = ?");
      projectParams.push(tokens.full);
    }
    if (tokens.outward) {
      const { getBoroughCodes } = require("./boroughPostcodes");
      for (const code of getBoroughCodes(tokens.outward)) {
        projectWhereParts.push("UPPER(p.location) = ?");
        projectParams.push(code);
      }
    }
    if (tokens.sector) {
      projectWhereParts.push("UPPER(p.location) LIKE ?");
      projectParams.push(`${tokens.outward}%`);
    }
    if (tokens.city) {
      projectWhereParts.push("LOWER(p.location) = ?");
      projectParams.push(tokens.city);
    }

    if (!projectWhereParts.length) {
      log.debug("no project location match conditions — skipping");
      return;
    }

    const projectLocationWhere = projectWhereParts.join(" OR ");

    const projects = await mysqlQuery(
      `SELECT p.id, p.name, p.type, p.location
         FROM projects p
        WHERE p.status = 'live'
          AND p.createdAt > DATE_SUB(NOW(), INTERVAL ${LOOKBACK_DAYS} DAY)
          AND p.ownerUserId <> ?
          AND (${projectLocationWhere})
        ORDER BY p.createdAt DESC
        LIMIT ${MAX_NOTIFICATIONS}`,
      [uid, ...projectParams],
    );

    if (!projects.length) {
      log.debug("no local projects found");
      return;
    }

    const createdAt = new Date();
    let inserted = 0;

    for (const project of projects) {
      const message = `A neighbour near you is looking for help with "${project.name}" — know someone good?`;
      const linkPath = `/projects/${project.id}`;

      await mysqlQuery(
        `INSERT INTO notifications
           (userId, type, message, projectId, linkPath, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uid, "project_live_local", message, project.id, linkPath, createdAt],
      );

      if (typeof broadcastNotification === "function") {
        broadcastNotification(uid, {
          type: "project_live_local",
          message,
          projectId: project.id,
          linkPath,
        });
      }

      sendPushToUser({
        uid,
        type: "project_live_local",
        title: "VetMyBuilder",
        body: message,
        linkPath,
        mysqlQuery,
        logActivity,
      });

      inserted++;
    }

    log.info({ count: inserted }, "notified new signup of local projects");

    if (typeof logActivity === "function") {
      logActivity(
        "signup.local_projects_notified",
        "info",
        uid,
        `Notified of ${inserted} local project(s) in ${location}`,
      );
    }
  } catch (err) {
    log.warn({ err: err?.message }, "failed to notify new signup of local projects");
  }
}

module.exports = { notifyNewSignupOfLocalProjects };
