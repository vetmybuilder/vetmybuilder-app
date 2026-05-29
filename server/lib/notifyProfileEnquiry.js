const { logger } = require("./logger");
const { sendPushToUser } = require("./pushSender");

const NOTIFICATION_TYPE = "profile_enquiry";

async function notifyProfileEnquiry({
  mysqlQuery,
  tradespersonUid,
  visitorName,
  visitorPhone,
  message,
  broadcastNotification,
}) {
  const log = logger.child({ module: "notifyProfileEnquiry", tradespersonUid });

  try {
    const truncMsg = String(message || "").slice(0, 100);
    const notifMessage = `New enquiry from ${visitorName} (${visitorPhone})${truncMsg ? `: ${truncMsg}` : ""}`;
    const linkPath = "/tradesman/leads";

    await mysqlQuery(
      `INSERT INTO notifications (userId, type, message, linkPath, createdAt)
       VALUES (?, ?, ?, ?, NOW())`,
      [tradespersonUid, NOTIFICATION_TYPE, notifMessage, linkPath],
    );

    try {
      broadcastNotification?.(tradespersonUid, {
        type: NOTIFICATION_TYPE,
        message: notifMessage,
        linkPath,
      });
    } catch {}

    sendPushToUser({
      uid: tradespersonUid,
      type: NOTIFICATION_TYPE,
      title: "New enquiry",
      body: notifMessage,
      linkPath,
      mysqlQuery,
    });

    log.info("Profile enquiry notification sent");
  } catch (err) {
    log.warn({ err: err?.message }, "Notification failed");
  }
}

module.exports = { notifyProfileEnquiry, NOTIFICATION_TYPE };
