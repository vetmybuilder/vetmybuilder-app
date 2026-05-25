// server/lib/notifyHomeownerGrantOpportunity.js
//
// Fire-and-forget: when a homeowner posts an Insulation job (any
// sub-type that maps to category "Insulation" in TYPE_TO_CATEGORY),
// nudge them about the ECO4 / GBIS grant funnel at
// /free-wall-insulation via:
//   1. an in-app notification (bell / inbox)
//   2. a web push (gated by user's grant_opportunities pref)
//   3. an email via Resend
//
// Idempotent per user: if the user already has any 'grant_opportunity'
// notification, the helper short-circuits silently. Posting many
// Insulation jobs still produces only one nudge.
//
// All errors are swallowed + logged. Never throws to the caller.

const { logger } = require("./logger");
const { sendPushToUser } = require("./pushSender");

const GRANT_LINK_PATH = "/free-wall-insulation";
const NOTIFICATION_TYPE = "grant_opportunity";
const PUSH_TITLE = "VetMyBuilder";
const APP_URL_FALLBACK = "https://vetmybuilder.com";

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMessage(firstName) {
  const name = firstName ? `${firstName}, ` : "";
  return `${name}you posted an Insulation job - you could get up to £14k of FREE insulation under the ECO4 grant. 2-min eligibility check.`;
}

async function sendGrantEmail({ recipientEmail, firstName, appUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const { Resend } = require("resend");
  const resend = new Resend(apiKey);
  const link = `${appUrl}${GRANT_LINK_PATH}`;
  const greeting = firstName ? `Hi ${escHtml(firstName)},` : "Hi,";
  const result = await resend.emails.send({
    from: "VetMyBuilder <noreply@vetmybuilder.com>",
    to: recipientEmail,
    subject: "You could get free wall insulation under the ECO4 grant",
    html: `
      <p>${greeting}</p>
      <p>Thanks for posting your insulation job on VetMyBuilder.</p>
      <p>Before you spend anything, it's worth a 2-minute check: the
      government is funding up to <strong>£14,000</strong> of insulation
      work per home under the <strong>ECO4 + GBIS</strong> grant scheme,
      and your job sounds like the kind of thing that often qualifies.</p>
      <p style="margin-top:18px">
        <a href="${escHtml(link)}"
           style="display:inline-block;padding:10px 18px;background:#047857;color:white;text-decoration:none;border-radius:8px;font-weight:700">
          Check my eligibility
        </a>
      </p>
      <p style="margin-top:18px;color:#6b7280;font-size:12px">
        Free check. No obligation. We'll route eligible jobs to a verified
        local specialist.
      </p>
    `,
  });
  if (result?.error) {
    const detail = result.error.message || JSON.stringify(result.error);
    throw new Error(`Resend: ${detail}`);
  }
  return { ok: true };
}

/**
 * @param {object} opts
 * @param {Function} opts.mysqlQuery
 * @param {string}   opts.ownerUid
 * @param {number}   opts.projectId
 * @param {Function} [opts.broadcastNotification]  - SSE broadcaster
 * @param {Function} [opts.logActivity]            - admin activity log
 */
async function notifyHomeownerGrantOpportunity({
  mysqlQuery,
  ownerUid,
  projectId,
  broadcastNotification,
  logActivity,
}) {
  const log = logger.child({ module: "notifyHomeownerGrantOpportunity", ownerUid, projectId });
  if (!ownerUid) {
    log.warn("missing ownerUid - skipping");
    return;
  }

  try {
    // Idempotency: if this user has ever been nudged about the grant,
    // don't nudge again - regardless of which project triggered it.
    const existing = await mysqlQuery(
      `SELECT id FROM notifications
         WHERE userId = ? AND type = ?
         LIMIT 1`,
      [ownerUid, NOTIFICATION_TYPE],
    );
    if (existing?.length) {
      log.info({ existingId: existing[0].id }, "already notified - skipping");
      return;
    }

    const userRows = await mysqlQuery(
      `SELECT email, firstName FROM users WHERE uid = ? LIMIT 1`,
      [ownerUid],
    );
    const user = userRows?.[0] || null;
    const email = user?.email || null;
    const firstName = user?.firstName || null;

    const message = buildMessage(firstName);

    // In-app notification + SSE.
    await mysqlQuery(
      `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [ownerUid, NOTIFICATION_TYPE, message, projectId, GRANT_LINK_PATH],
    );
    try {
      broadcastNotification?.(ownerUid, {
        type: NOTIFICATION_TYPE,
        message,
        projectId,
        linkPath: GRANT_LINK_PATH,
      });
    } catch (err) {
      log.warn({ err: err?.message }, "broadcastNotification threw");
    }

    // Web push - gated by user's grant_opportunities pref. sendPushToUser
    // never throws; failures are logged inside.
    sendPushToUser({
      uid: ownerUid,
      type: NOTIFICATION_TYPE,
      title: PUSH_TITLE,
      body: message,
      linkPath: GRANT_LINK_PATH,
      mysqlQuery,
      logActivity,
    });

    // Email via Resend (best effort).
    if (email) {
      const appUrl = process.env.PUBLIC_APP_URL || APP_URL_FALLBACK;
      try {
        const emailResult = await sendGrantEmail({
          recipientEmail: email,
          firstName,
          appUrl,
        });
        if (!emailResult.ok) {
          log.info({ reason: emailResult.error }, "grant email skipped");
        } else {
          log.info({ recipientEmail: email }, "grant email sent");
        }
      } catch (err) {
        log.warn({ err: err?.message }, "grant email send failed");
      }
    } else {
      log.info("no email on file - skipping email send");
    }

    log.info("grant opportunity nudge dispatched");
  } catch (err) {
    log.warn({ err: err?.message, stack: err?.stack }, "notify failed");
  }
}

module.exports = {
  notifyHomeownerGrantOpportunity,
  NOTIFICATION_TYPE,
  GRANT_LINK_PATH,
};
