// server/lib/matchRecommendationToTradesman.js
//
// Fire-and-forget: when a recommendation is created, check whether the
// recommended company matches an onboarded tradesman. If so, insert a
// notification so they know they've been recommended.

const { enrichMessage } = require("./ai/enrichNotificationMessage");
const { sendPushToUser } = require("./pushSender");

const SUFFIXES =
  /\b(ltd|limited|inc|plc|llp|co|company)\b/gi;

/**
 * Strip corporate suffixes, non-alphanumeric chars, and lowercase.
 * Exported so tests can verify normalisation independently.
 */
function normaliseCompanyName(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(SUFFIXES, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/**
 * @param {object} opts
 * @param {Function} opts.mysqlQuery
 * @param {Function} [opts.broadcastNotification]
 * @param {Function} [opts.logActivity]
 * @param {string}   opts.companyName
 * @param {number}   opts.projectId
 * @param {string}   [opts.projectLocation]
 */
async function matchAndNotifyTradesman({
  mysqlQuery,
  broadcastNotification,
  logActivity,
  companyName,
  projectId,
  projectLocation,
}) {
  try {
    const normInput = normaliseCompanyName(companyName);
    if (!normInput) return;

    const rows = await mysqlQuery(
      `SELECT user_id, company_name FROM tradesmen WHERE status = 'active'`
    );

    const match = (rows || []).find(
      (r) => normaliseCompanyName(r.company_name) === normInput
    );
    if (!match) return;

    const tradesmanUserId = match.user_id;

    // Guard: prevent double-notify for same tradesman + project
    const existing = await mysqlQuery(
      `SELECT id FROM notifications
        WHERE userId = ? AND type = 'recommendation_for_tradesman' AND projectId = ?
        LIMIT 1`,
      [tradesmanUserId, projectId]
    );
    if (existing && existing.length > 0) return;

    const area = projectLocation || "your area";
    const templateMessage = `You've been recommended for a project in ${area}`;
    const message = await enrichMessage({
      type: "recommendation_for_tradesman",
      templateMessage,
      context: { area, projectId },
      mysqlQuery,
    });
    const linkPath = `/projects/${projectId}`;

    await mysqlQuery(
      `INSERT INTO notifications
         (userId, type, message, projectId, linkPath, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        tradesmanUserId,
        "recommendation_for_tradesman",
        message,
        projectId,
        linkPath,
        new Date(),
      ]
    );

    if (typeof broadcastNotification === "function") {
      broadcastNotification(tradesmanUserId, {
        type: "recommendation_for_tradesman",
        message,
        projectId,
        linkPath,
      });
    }

    sendPushToUser({
      uid: tradesmanUserId,
      type: "recommendation_for_tradesman",
      title: "VetMyBuilder",
      body: message,
      linkPath,
      mysqlQuery,
      logActivity,
    });

    if (typeof logActivity === "function") {
      logActivity(
        "recommendation.tradesman_matched",
        "info",
        tradesmanUserId,
        `Tradesman "${match.company_name}" matched recommendation on project #${projectId}`
      );
    }
  } catch (err) {
    console.warn(
      "[matchAndNotifyTradesman] fire-and-forget error:",
      err?.message || err
    );
  }
}

module.exports = { matchAndNotifyTradesman, normaliseCompanyName };
