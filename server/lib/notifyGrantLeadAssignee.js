// server/lib/notifyGrantLeadAssignee.js
//
// Fire-and-forget: when a new grant_leads row is created, push-notify
// the assigned specialist (Elegant Building by default) so they can
// follow up immediately. Body of the push carries the actionable
// details (postcode, first name, phone, reference) so the recipient
// doesn't need to open the admin page to act.
//
// Resolution order for the assignee uid:
//   1. process.env.ELEGANT_TRADESPERSON_UID (string Firebase uid)
//   2. `SELECT user_id FROM tradesmen WHERE LOWER(company_name) LIKE 'elegant%'`
// Ghost routing applied so staging ghost rows reach the master operator.
//
// Never throws. All failures are logged.

const { logger } = require("./logger");
const { sendPushToUser } = require("./pushSender");
const { resolveGhostNotificationTarget } = require("./ghostTradesman");
const { resolveGrantAssigneeUid } = require("./resolveGrantAssignee");

const NOTIFICATION_TYPE = "grant_lead_assigned";
const PUSH_TITLE = "VetMyBuilder";
const LINK_PATH = "/tradesman/leads?type=grants";

function firstNameOf(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "(no name)";
}

/**
 * @param {object} opts
 * @param {Function} opts.mysqlQuery
 * @param {number}   opts.grantLeadId
 * @param {string}   opts.reference
 * @param {string}   opts.postcode
 * @param {string}   opts.name
 * @param {string}   opts.phone
 * @param {Function} [opts.broadcastNotification]
 * @param {Function} [opts.logActivity]
 */
async function notifyGrantLeadAssignee({
  mysqlQuery,
  grantLeadId,
  reference,
  postcode,
  name,
  phone,
  broadcastNotification,
  logActivity,
}) {
  const log = logger.child({
    module: "notifyGrantLeadAssignee",
    grantLeadId,
    reference,
  });

  try {
    const rawUid = await resolveGrantAssigneeUid(mysqlQuery);
    if (!rawUid) {
      log.warn("no assignee uid resolved - skipping push");
      return;
    }
    const notifyUid = await resolveGhostNotificationTarget(mysqlQuery, rawUid);

    const firstName = firstNameOf(name);
    const message = `New grant lead in ${postcode}: ${firstName}, ${phone}. Ref ${reference}.`;

    await mysqlQuery(
      `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
       VALUES (?, ?, ?, NULL, ?, NOW())`,
      [notifyUid, NOTIFICATION_TYPE, message, LINK_PATH],
    );
    try {
      broadcastNotification?.(notifyUid, {
        type: NOTIFICATION_TYPE,
        message,
        projectId: null,
        linkPath: LINK_PATH,
      });
    } catch (err) {
      log.warn({ err: err?.message }, "broadcastNotification threw");
    }

    sendPushToUser({
      uid: notifyUid,
      type: NOTIFICATION_TYPE,
      title: PUSH_TITLE,
      body: message,
      linkPath: LINK_PATH,
      mysqlQuery,
      logActivity,
    });

    try {
      await mysqlQuery(
        `INSERT INTO grant_lead_events
           (grant_lead_id, event_type, detail)
         VALUES (?, 'push_sent', ?)`,
        [
          grantLeadId,
          JSON.stringify({ notifyUid, rawUid }),
        ],
      );
    } catch (err) {
      log.warn({ err: err?.message }, "grant_lead_events insert failed");
    }

    log.info({ notifyUid }, "assignee push dispatched");
  } catch (err) {
    log.warn({ err: err?.message, stack: err?.stack }, "notify failed");
  }
}

module.exports = { notifyGrantLeadAssignee, NOTIFICATION_TYPE };
