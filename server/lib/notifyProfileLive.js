const { logger } = require("./logger");
const { sendPushToUser } = require("./pushSender");

const NOTIFICATION_TYPE = "profile_live";

async function notifyProfileLive({ mysqlQuery, uid, slug, broadcastNotification }) {
  const log = logger.child({ module: "notifyProfileLive", uid, slug });

  try {
    const message = "Your free public profile page is live! Tap to view and share it.";
    const linkPath = `/t/${slug}`;

    await mysqlQuery(
      `INSERT INTO notifications (userId, type, message, linkPath, createdAt)
       VALUES (?, ?, ?, ?, NOW())`,
      [uid, NOTIFICATION_TYPE, message, linkPath],
    );

    try {
      broadcastNotification?.(uid, { type: NOTIFICATION_TYPE, message, linkPath });
    } catch {}

    sendPushToUser({
      uid,
      type: NOTIFICATION_TYPE,
      title: "Your profile is live",
      body: message,
      linkPath,
      mysqlQuery,
    });

    log.info("Profile live notification sent");
  } catch (err) {
    log.warn({ err: err?.message }, "Notification failed");
  }
}

module.exports = { notifyProfileLive, NOTIFICATION_TYPE };
