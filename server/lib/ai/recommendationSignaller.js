// server/lib/ai/recommendationSignaller.js
const llmClient = require("./llmClient");

const CLASSIFIER_VERSION = "rec-signaller-v1";
const FEATURE = "rec_signal";

const SYSTEM_PROMPT = `You analyse a homeowner's recommendation of a tradesperson.

Given the recommendation comment text, return a JSON object with:

- sentiment: a number from -1 (very negative) to +1 (very positive). Most recommendations are positive (0.5–0.9). Reserve -1 to 0 for genuinely negative feedback.
- generic_score: a number from 0 (highly specific and detailed) to 1 (completely generic/boilerplate). "They were great" = 0.9. A detailed description of specific work done = 0.1.
- themes: an array of 1–5 short theme strings capturing what the comment is about. Use consistent labels: "reliability", "communication", "tidiness", "value", "quality", "punctuality", "professionalism", "speed", "expertise", "friendliness".

Respond with ONLY valid JSON, no markdown fences:
{"sentiment": 0.8, "generic_score": 0.3, "themes": ["reliability", "quality"]}`;

const STUB_RESPONSE = JSON.stringify({
  sentiment: 0.85,
  generic_score: 0.25,
  themes: ["reliability", "communication", "quality"],
});

function parseJsonResponse(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try { return JSON.parse(text.slice(first, last + 1)); } catch { return null; }
    }
    return null;
  }
}

async function computeRecommendationSignals({
  mysqlQuery,
  recommendationId,
  comment,
  log = console,
}) {
  if (!mysqlQuery || !recommendationId || !comment) return null;

  const wordCount = String(comment).trim().split(/\s+/).filter(Boolean).length;

  const userPrompt = `Analyse this recommendation:\n\n${comment}`;

  let result;
  try {
    result = await llmClient.complete({
      feature: FEATURE,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      stub: STUB_RESPONSE,
      maxTokens: 300,
      mysqlQuery,
      log,
    });
  } catch (err) {
    log.warn?.("[rec-signaller] LLM call failed", {
      recommendationId,
      error: err?.message,
    });
    return null;
  }

  const structured = parseJsonResponse(result.text);
  if (!structured) {
    log.warn?.("[rec-signaller] invalid JSON response", {
      recommendationId,
      raw: result.text?.slice(0, 200),
    });
    return null;
  }

  const { sentiment, generic_score, themes } = structured;

  // Validate ranges
  if (typeof sentiment !== "number" || sentiment < -1 || sentiment > 1) {
    log.warn?.("[rec-signaller] sentiment out of range", { recommendationId, sentiment });
    return null;
  }
  if (typeof generic_score !== "number" || generic_score < 0 || generic_score > 1) {
    log.warn?.("[rec-signaller] generic_score out of range", { recommendationId, generic_score });
    return null;
  }
  if (!Array.isArray(themes) || themes.length === 0) {
    log.warn?.("[rec-signaller] themes invalid", { recommendationId, themes });
    return null;
  }

  try {
    await mysqlQuery(
      `INSERT INTO recommendation_signals
        (recommendation_id, word_count, generic_score, sentiment, themes, classifier_version, computed_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        word_count         = VALUES(word_count),
        generic_score      = VALUES(generic_score),
        sentiment          = VALUES(sentiment),
        themes             = VALUES(themes),
        classifier_version = VALUES(classifier_version),
        computed_at        = NOW()`,
      [
        Number(recommendationId),
        wordCount,
        generic_score,
        sentiment,
        JSON.stringify(themes),
        CLASSIFIER_VERSION,
      ],
    );
  } catch (err) {
    log.error?.("[rec-signaller] DB upsert failed", {
      recommendationId,
      error: err?.message,
    });
    return null;
  }

  return { sentiment, generic_score, themes, wordCount };
}

module.exports = {
  computeRecommendationSignals,
  CLASSIFIER_VERSION,
  FEATURE,
  STUB_RESPONSE,
};
