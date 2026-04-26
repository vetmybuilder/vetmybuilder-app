// server/lib/sendBuilderInviteEmail.js
//
// Fire-and-forget: when an off-platform recommendation is created (the
// recommended builder isn't on VMB yet), email them an invite to claim a
// profile. Records the send in `recommendation_invites` so the homeowner's
// nudge endpoint can rate-limit subsequent nudges.

const { logger } = require("./logger");

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {object} opts
 * @param {Function} opts.mysqlQuery
 * @param {number}   opts.recommendationId
 * @param {string}   opts.recipientEmail
 * @param {string}   opts.builderCompanyName
 * @param {string}   opts.recommenderFirstName
 * @param {string}   opts.projectArea
 * @param {object}   [opts._resendClient]  — injectable for tests; defaults to real Resend
 * @returns {Promise<boolean>} true on send success, false otherwise.
 */
async function sendBuilderInviteEmail({
  mysqlQuery,
  recommendationId,
  recipientEmail,
  builderCompanyName,
  recommenderFirstName,
  projectArea,
  _resendClient,
}) {
  const log = logger.child({ module: "sendBuilderInviteEmail", recommendationId });

  const apiKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || "https://vetmybuilder.com";

  if (!apiKey) {
    log.warn("RESEND_API_KEY missing — skipping invite send");
    return false;
  }
  if (!recipientEmail) {
    log.info("no recipient email — skipping invite send");
    return false;
  }

  const company = escHtml(builderCompanyName);
  const recommender = escHtml(recommenderFirstName || "Someone");
  const area = escHtml(projectArea || "their area");
  const signupUrl = escHtml(`${appUrl}/tradesmen/join?from=invite`);

  try {
    // Insert row first so a failed send leaves a NULL emailSentAt sentinel
    // (detectable by the nudge path) rather than an untracked send.
    // ON DUPLICATE KEY UPDATE keeps nudge history intact if called twice.
    await mysqlQuery(
      `INSERT INTO recommendation_invites
         (recommendationId, sentToEmail, emailSentAt, createdAt)
       VALUES (?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE sentToEmail = VALUES(sentToEmail)`,
      [recommendationId, recipientEmail, new Date()],
    );

    const { Resend } = require("resend");
    const resend = _resendClient || new Resend(apiKey);

    await resend.emails.send({
      from: "VetMyBuilder <noreply@vetmybuilder.com>",
      to: recipientEmail,
      subject: `${recommender} recommended you on VetMyBuilder`,
      html: `
        <p><strong>${recommender}</strong> recommended <strong>${company}</strong> for a project in <strong>${area}</strong>.</p>
        <p>Claim your free profile to see their note, message the homeowner, and get matched with similar projects.</p>
        <p style="margin-top:18px"><a href="${signupUrl}" style="display:inline-block;padding:10px 18px;background:#4338ca;color:white;text-decoration:none;border-radius:8px;font-weight:700">Claim your profile</a></p>
        <p style="margin-top:18px;color:#6b7280;font-size:12px">Free to claim. No credit card. Takes 2 mins.</p>
      `,
    });

    // Mark sent only after Resend confirms delivery
    await mysqlQuery(
      `UPDATE recommendation_invites SET emailSentAt = ? WHERE recommendationId = ?`,
      [new Date(), recommendationId],
    );

    log.info({ recipientEmail }, "invite email sent");
    return true;
  } catch (err) {
    log.warn({ err: err?.message }, "invite email send failed");
    return false;
  }
}

module.exports = { sendBuilderInviteEmail };
