// server/lib/ai/llmClient.js
//
// Project Lighthouse — generic LLM wrapper.
//
// Two modes:
//
//   stub  : returns a caller-provided fallback response. No network call.
//           Free, instant, deterministic. Default in dev and test.
//
//   real  : calls Anthropic's API for real. Costs money. Used in production
//           and when the developer explicitly opts in via LLM_MODE=real.
//
// Mode resolution:
//
//   1. process.env.LLM_MODE if set ('stub' | 'real')
//   2. 'real' if process.env.ANTHROPIC_API_KEY is set
//   3. 'stub' otherwise (and always in tests)
//
// Every call is logged to ai_inference_log regardless of mode, so cost,
// latency, and prompt history are auditable across both modes.
//
// Design notes:
//
//   - We hit the Anthropic REST API directly with global fetch (Node 18+).
//     No SDK dependency. Easier to swap providers later if we want.
//   - Stub responses are caller-provided, not generated here. Each feature
//     module (projectClassifier, reviewSummariser, ...) ships with its own
//     stub data alongside its prompt.
//   - cost_pence is a rough approximation from token counts. Good enough for
//     budgeting; not for invoice reconciliation.

const crypto = require("crypto");

const TAG = "[llm-client]";

// Anthropic Claude Haiku — cheap, fast, structured-output-friendly.
// Override per-call via the `model` parameter.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Rough token costs in pence (per 1M tokens). Update when prices change.
// Source: anthropic.com/pricing — Claude Haiku 4.5 as of 2026.
const COST_PER_MILLION_INPUT_PENCE = 80;   // ~$1.00 / 1M input tokens
const COST_PER_MILLION_OUTPUT_PENCE = 400; // ~$5.00 / 1M output tokens

// Cap how big a prompt we'll log to keep the table from bloating with
// entire project descriptions if a user pastes War and Peace into a form.
const MAX_LOGGED_PROMPT_CHARS = 8000;
const MAX_LOGGED_RESPONSE_CHARS = 8000;

/**
 * Resolve the active mode at call time.
 */
function resolveMode() {
  const explicit = String(process.env.LLM_MODE || "").trim().toLowerCase();
  if (explicit === "stub" || explicit === "real") return explicit;
  // Tests always force stub regardless of env. Vitest/Node test runner sets NODE_ENV.
  if (process.env.NODE_ENV === "test") return "stub";
  if (process.env.ANTHROPIC_API_KEY) return "real";
  return "stub";
}

/**
 * Run an LLM completion. Stub mode returns the caller's fallback; real mode
 * calls Anthropic. Either way, the call is logged to ai_inference_log.
 *
 * @param {Object} args
 * @param {string} args.feature       Logical name of the calling feature
 *                                    (e.g. 'project_classify') — used for
 *                                    cost reporting and audit grouping.
 * @param {string} args.system        System prompt.
 * @param {string} args.user          User prompt — the actual question.
 * @param {string} args.stub          Stub response to return when in stub mode.
 *                                    Must be a string (for JSON outputs the
 *                                    caller stringifies before passing).
 * @param {string} [args.model]       Override the default model.
 * @param {number} [args.maxTokens]   Max output tokens (default 1024).
 * @param {Function} args.mysqlQuery  ctx.mysqlQuery — for logging.
 * @param {Object} [args.log]         Optional logger (defaults to console).
 *
 * @returns {Promise<{ text: string, mode: string, costPence: number, latencyMs: number }>}
 */
async function complete({
  feature,
  system,
  user,
  stub,
  model = DEFAULT_MODEL,
  maxTokens = 1024,
  mysqlQuery,
  log = console,
}) {
  if (!feature) throw new Error("[llm-client] feature is required");
  if (typeof user !== "string") throw new Error("[llm-client] user must be a string");
  if (typeof stub !== "string")
    throw new Error("[llm-client] stub fallback is required (string)");

  const mode = resolveMode();
  const startedAt = Date.now();

  let text;
  let costPence = 0;

  if (mode === "stub") {
    text = stub;
  } else {
    try {
      const result = await callAnthropic({ system, user, model, maxTokens });
      text = result.text;
      costPence = estimateCostPence(result.inputTokens, result.outputTokens);
    } catch (e) {
      log.warn?.(`${TAG} real call failed, falling back to stub`, {
        feature,
        error: e?.message || e,
      });
      text = stub;
    }
  }

  const latencyMs = Date.now() - startedAt;

  // Fire-and-forget audit log. Never let a failed log break the call.
  logInference({
    mysqlQuery,
    feature,
    model: mode === "stub" ? `${model}-STUB` : model,
    prompt: user,
    response: text,
    costPence,
    latencyMs,
    log,
  });

  return { text, mode, costPence, latencyMs };
}

// ── Internal: Anthropic API call ────────────────────────────────────

async function callAnthropic({ system, user, model, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing — cannot call real API");
  }

  const body = {
    model,
    max_tokens: maxTokens,
    system: system || undefined,
    messages: [{ role: "user", content: user }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const data = await res.json();
  // Claude returns content as an array of blocks. We only use the first
  // text block — function calling and tool use aren't in scope for Day 3.
  const textBlock = (data.content || []).find((b) => b.type === "text");
  const text = textBlock?.text || "";

  return {
    text,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

function estimateCostPence(inputTokens, outputTokens) {
  const inputPence = (inputTokens / 1_000_000) * COST_PER_MILLION_INPUT_PENCE;
  const outputPence = (outputTokens / 1_000_000) * COST_PER_MILLION_OUTPUT_PENCE;
  return Math.ceil(inputPence + outputPence);
}

// ── Internal: audit logging ─────────────────────────────────────────

async function logInference({
  mysqlQuery,
  feature,
  model,
  prompt,
  response,
  costPence,
  latencyMs,
  log,
}) {
  if (!mysqlQuery) return;

  try {
    const truncatedPrompt = String(prompt || "").slice(0, MAX_LOGGED_PROMPT_CHARS);
    const truncatedResponse = String(response || "").slice(0, MAX_LOGGED_RESPONSE_CHARS);
    const promptHash = crypto
      .createHash("sha256")
      .update(truncatedPrompt)
      .digest("hex");

    await mysqlQuery(
      `
      INSERT INTO ai_inference_log
        (feature, model, prompt_hash, prompt, response, cost_pence, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        feature,
        model,
        promptHash,
        truncatedPrompt,
        truncatedResponse,
        costPence,
        latencyMs,
      ],
    );
  } catch (e) {
    log.warn?.(`${TAG} logInference failed`, { error: e?.message || e });
  }
}

module.exports = {
  complete,
  resolveMode,
};
