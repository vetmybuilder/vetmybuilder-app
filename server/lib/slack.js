// server/lib/slack.js
//
// One-way Slack notifications via Incoming Webhook. No retries, no
// queue - the webhook is fast (~150ms) and a missed notification is
// not worth blocking a signup over. Failures are logged and swallowed
// so the calling route never errors because Slack hiccupped.
//
// Set SLACK_WEBHOOK_URL in env to enable. When unset (e.g. local dev
// without the var, or CI), the helper short-circuits silently so tests
// and dev flows aren't dependent on Slack.

const { logger } = require("./logger");

const log = logger?.child?.({ module: "slack" }) || logger;

/**
 * Post a message to the configured Slack webhook.
 * @param {object} payload - Slack message payload. Either `{text}` or
 *   `{blocks: [...]}` (preferred for rich layout). See
 *   https://api.slack.com/messaging/webhooks#advanced_message_formatting
 * @returns {Promise<boolean>} true if delivered, false if disabled / failed.
 */
async function postSlackMessage(payload) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Hard cap so a hung Slack response can't stall the request.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log?.warn?.(
        { status: res.status, body: body.slice(0, 200) },
        "slack webhook returned non-2xx",
      );
      return false;
    }
    return true;
  } catch (err) {
    log?.warn?.(
      { err: err?.message || String(err) },
      "slack webhook post failed",
    );
    return false;
  }
}

module.exports = { postSlackMessage };
