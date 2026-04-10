// server/lib/ai/recommendationSummariser.js
//
// Project Lighthouse — Day 4.
//
// Summarises homeowner recommendations for a building company into exactly
// 3 concise bullet points. The bullets surface recurring themes — reliability,
// communication, quality, pricing, tidiness — so prospective clients can
// quickly gauge reputation without reading every recommendation.
//
// Stub mode returns a deterministic 3-bullet response (free, instant).
// Real mode uses Claude Haiku via llmClient.

const llmClient = require("./llmClient");

const CLASSIFIER_VERSION = "rec-summariser-v1";
const FEATURE = "rec_summary";

const SYSTEM_PROMPT = `\
You are a recommendation summariser for a UK home-improvement marketplace \
called VetMyBuilder. You will be given a set of homeowner recommendations \
about a building company. Your job is to produce exactly 3 concise bullet \
points summarising what homeowners consistently say about the company.

Each bullet must be a maximum of 15 words. Focus on recurring themes such \
as reliability, communication, quality of work, pricing, and tidiness. \
You must cite real patterns found in the input — never invent praise or \
fabricate details that aren't supported by the recommendations.

Output JSON only — no commentary, no Markdown fences, no preamble. Use \
this exact shape:

{"bullets": ["First.", "Second.", "Third."]}

Output ONLY the JSON object. Nothing else.`;

/**
 * Deterministic stub for dev/test. Three generic-but-plausible bullets.
 */
const STUB_RESPONSE = JSON.stringify(
  {
    bullets: [
      "Consistently reliable and punctual across all projects.",
      "High quality finishes praised by multiple homeowners.",
      "Clear communication throughout every stage of the build.",
    ],
  },
  null,
  2,
);

/**
 * Summarise builder recommendations into 3 bullet points.
 *
 * Designed to be called fire-and-forget. If anything goes wrong, logs and
 * returns null — never throws into the caller.
 *
 * @param {Object} args
 * @param {Function} args.mysqlQuery   ctx.mysqlQuery
 * @param {string}   args.company      company name
 * @param {string[]} args.comments     array of recommendation comment texts
 * @param {number[]} args.recommendationIds  DB ids of the recommendations used
 * @param {Object}   [args.log]        optional logger
 *
 * @returns {Promise<Object|null>}     { bullets: string[] } or null on failure
 */
async function summariseBuilderRecommendations({
  mysqlQuery,
  company,
  comments,
  recommendationIds,
  log = console,
}) {
  if (!mysqlQuery) return null;
  if (!company || typeof company !== "string") return null;
  if (!Array.isArray(comments) || comments.length === 0) return null;

  // Build user prompt — company name + numbered comments
  const userPrompt = buildUserPrompt({ company, comments });

  let result;
  try {
    result = await llmClient.complete({
      feature: FEATURE,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      stub: STUB_RESPONSE,
      maxTokens: 400,
      mysqlQuery,
      log,
    });
  } catch (e) {
    log.warn?.("[rec-summariser] complete() failed", {
      company,
      error: e?.message || e,
    });
    return null;
  }

  // Parse the JSON response defensively
  const structured = parseJsonResponse(result.text, log);
  if (!structured) {
    log.warn?.("[rec-summariser] could not parse JSON response", {
      company,
      sample: String(result.text || "").slice(0, 200),
    });
    return null;
  }

  // Validate bullets shape: must be an array of exactly 3 strings
  if (
    !Array.isArray(structured.bullets) ||
    structured.bullets.length !== 3
  ) {
    log.warn?.("[rec-summariser] bullets array invalid", {
      company,
      bulletsLength: structured.bullets?.length,
    });
    return null;
  }

  // Upsert into builder_summaries
  try {
    await mysqlQuery(
      `
      INSERT INTO builder_summaries
        (company, bullets, recommendation_count, recommendation_ids, classifier_version, computed_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        bullets              = VALUES(bullets),
        recommendation_count = VALUES(recommendation_count),
        recommendation_ids   = VALUES(recommendation_ids),
        classifier_version   = VALUES(classifier_version),
        computed_at          = NOW()
      `,
      [
        company,
        JSON.stringify(structured.bullets),
        comments.length,
        JSON.stringify(recommendationIds),
        CLASSIFIER_VERSION,
      ],
    );
  } catch (e) {
    log.warn?.("[rec-summariser] upsert failed", {
      company,
      error: e?.message || e,
    });
  }

  return { bullets: structured.bullets };
}

// ── Internal helpers ────────────────────────────────────────────────

function buildUserPrompt({ company, comments }) {
  const lines = [
    `Summarise the following homeowner recommendations for ${company}:`,
    "",
  ];
  comments.forEach((comment, i) => {
    lines.push(`${i + 1}. ${comment}`);
  });
  lines.push("");
  lines.push("Return JSON only.");
  return lines.join("\n");
}

function parseJsonResponse(raw, log) {
  if (!raw) return null;
  let text = String(raw).trim();

  // Strip Markdown fences if the LLM wrapped the JSON in them despite
  // being told not to.
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    // One last attempt: find the first { and last } and parse what's between.
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = {
  summariseBuilderRecommendations,
  CLASSIFIER_VERSION,
  FEATURE,
};
