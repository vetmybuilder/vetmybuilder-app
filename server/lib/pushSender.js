// server/lib/pushSender.js
const webpush = require("web-push");
const { logger } = require("./logger");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

const vapidConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);

if (vapidConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/** Maps notification types to preference categories */
const CATEGORY_MAP = {
  hire_received: "hire_updates",
  hire_accepted: "hire_updates",
  hire_declined: "hire_updates",
  hire_cancelled: "hire_updates",
  recommendation_new: "recommendations",
  recommendation_for_tradesman: "recommendations",
  match_formed: "matches",
  inbox_message_new: "messages",
  chat_message_new: "messages",
  project_live_local: "local_activity",
  project_closed_local: "local_activity",
  project_match: "project_matches",
  // tradesman_interest / tradesman_shared_profile are no longer fired anywhere
  // and intentionally absent from the map.
};

/** Default push preferences when no DB row exists */
const DEFAULT_PREFERENCES = {
  hire_updates: true,
  recommendations: true,
  matches: true,
  messages: true,
  local_activity: false,
  project_matches: true,
};

/**
 * Send a push notification to all of a user's subscribed devices.
 * Never throws — all errors are caught and logged.
 */
async function sendPushToUser({ uid, type, title, body, linkPath, mysqlQuery, logActivity }) {
  try {
    if (!vapidConfigured) return;

    const category = CATEGORY_MAP[type];
    if (!category) return;

    // Check user preference for this category
    const prefRows = await mysqlQuery(
      "SELECT push_enabled FROM notification_preferences WHERE uid = ? AND category = ?",
      [uid, category],
    );

    const enabled =
      prefRows.length > 0 ? Boolean(prefRows[0].push_enabled) : DEFAULT_PREFERENCES[category];

    if (!enabled) return;

    // Get all push subscriptions for this user
    const subs = await mysqlQuery(
      "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE uid = ?",
      [uid],
    );

    if (!subs.length) return;

    const payload = JSON.stringify({ title, body, linkPath });

    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };

        try {
          await webpush.sendNotification(subscription, payload);
        } catch (err) {
          const status = err?.statusCode;
          if (status === 410 || status === 404) {
            // Subscription expired — clean up
            await mysqlQuery("DELETE FROM push_subscriptions WHERE id = ?", [sub.id]);
            logger.info({ subId: sub.id, uid }, "removed expired push subscription");
          } else {
            throw err;
          }
        }
      }),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter(
      (r) => r.status === "rejected",
    ).length;

    if (logActivity) {
      logActivity("push.sent", "info", uid, { type, sent, failed });
    }
  } catch (err) {
    logger.error({ err: err?.message, uid, type }, "sendPushToUser failed");
  }
}

module.exports = { sendPushToUser, CATEGORY_MAP, DEFAULT_PREFERENCES, vapidConfigured };
