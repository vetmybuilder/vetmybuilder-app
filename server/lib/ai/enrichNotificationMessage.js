// server/lib/ai/enrichNotificationMessage.js
//
// LLM enrichment for notification messages. Rewrites template messages
// into warmer, more natural language while preserving all factual content.
//
// Falls back to the original template if the LLM call fails or the
// notification type is not enrichable.

const llmClient = require("./llmClient");

const ENRICHABLE_TYPES = [
  "hire_received",
  "hire_accepted",
  "hire_declined",
  "recommendation_for_tradesman",
  "tradesman_interest",
  "tradesman_shared_profile",
];

const SYSTEM_PROMPT = [
  "You are a notification copywriter for VetMyBuilder, a platform connecting homeowners with vetted tradespeople.",
  "Rewrite the given notification message to sound warmer and more natural.",
  "Rules:",
  "- Maximum 2 sentences.",
  "- No emojis.",
  "- Do not invent details that are not in the original message or context.",
  "- Keep all names, project titles, and factual details exactly as provided.",
  "- Return only the rewritten message text, nothing else.",
].join("\n");

/**
 * Enrich a notification message using the LLM.
 *
 * @param {object} opts
 * @param {string} opts.type              Notification type (e.g. 'hire_received')
 * @param {string} opts.templateMessage   The original template message
 * @param {object} [opts.context]         Extra context to include in the prompt
 * @param {Function} [opts.mysqlQuery]    For LLM audit logging
 * @returns {Promise<string>}             Enriched message or original template
 */
async function enrichMessage({ type, templateMessage, context, mysqlQuery }) {
  if (!ENRICHABLE_TYPES.includes(type)) {
    return templateMessage;
  }

  try {
    const contextStr = context
      ? `\nContext: ${JSON.stringify(context)}`
      : "";

    const userPrompt = `Rewrite this notification message:\n\n"${templateMessage}"${contextStr}`;

    const { text } = await llmClient.complete({
      feature: "notification_enrichment",
      system: SYSTEM_PROMPT,
      user: userPrompt,
      stub: templateMessage,
      maxTokens: 128,
      mysqlQuery,
    });

    return text || templateMessage;
  } catch {
    return templateMessage;
  }
}

module.exports = { enrichMessage, ENRICHABLE_TYPES };
