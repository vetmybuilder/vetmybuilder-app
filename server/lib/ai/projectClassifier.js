// server/lib/ai/projectClassifier.js
//
// Project Lighthouse — Day 3.
//
// Turns a free-text project description into a structured representation:
//
//   {
//     "type": "...",                  // primary trade category
//     "scope": "small|medium|large|xlarge",
//     "complexity": "simple|moderate|complex|specialist",
//     "urgency": "asap|weeks|months|flexible",
//     "recommended_trades": [...],    // trade types this project needs
//     "price_band_estimate": "£X–£Y",
//     "materials": [...],             // materials mentioned (optional)
//     "key_concerns": [...],          // what the homeowner cares about
//     "summary": "..."                // one-sentence rephrasing
//   }
//
// The output schema is the contract every downstream feature depends on.
// Don't change field names lightly — match observations, the future
// re-ranker, and the decision assistant all read from this shape.
//
// Stub mode returns a generic-but-realistic response so the rest of the
// pipeline can be tested end-to-end with no API key.
//
// Real mode uses Claude Haiku via the llmClient. ~£0.005 per call at
// production volume; £0 in dev.

const llmClient = require("./llmClient");

const CLASSIFIER_VERSION = "project-classifier-v1";
const FEATURE = "project_classify";

const SYSTEM_PROMPT = `\
You are a project classifier for a UK home-improvement marketplace called \
VetMyBuilder. Your job is to read a homeowner's free-text project description \
and produce a structured JSON representation that downstream systems use to \
match the homeowner with the right tradespeople.

Output JSON only — no commentary, no Markdown fences, no preamble. Use the \
exact field names below. If a field is unknown, use null or an empty array \
as appropriate. Never invent specifics that aren't in the input.

Fields:
  type                 - one short string describing the primary trade \
("General Builder", "Plumber", "Electrician", "Roofer", "Decorator", \
"Kitchen Fitter", "Bathroom Fitter", "Plasterer", "Tiler", "Loft Conversion \
Specialist", "Extension Builder", or "Other")
  scope                - one of: "small", "medium", "large", "xlarge"
  complexity           - one of: "simple", "moderate", "complex", "specialist"
  urgency              - one of: "asap", "weeks", "months", "flexible"
  recommended_trades   - array of trade-type strings the project needs (1-5 items)
  price_band_estimate  - UK price range as a string, e.g. "£500–£2,000" \
or "£15,000–£35,000". Use the reference prices below as a guide and \
adjust for scope, property size, location (London/SE add 20-40%), and \
complexity. Always give a range, never a single figure.

UK TRADE PRICE REFERENCE (2024-2025, ex-VAT, labour + materials):
  Bathroom refit (standard): £4,000–£8,000; high-end: £10,000–£20,000
  Kitchen fit (supply + install): £8,000–£15,000; high-end: £20,000–£40,000
  Loft conversion (dormer): £35,000–£55,000; velux: £20,000–£35,000
  Single-storey extension: £30,000–£60,000; two-storey: £50,000–£100,000
  New boiler (combi, installed): £2,500–£4,500
  Full rewire (3-bed): £3,500–£5,500
  Full house replaster (3-bed): £4,000–£7,000
  External wall insulation (semi-detached): £8,000–£15,000; detached: £12,000–£22,000
  Internal wall insulation (per room): £1,500–£3,000
  Flat roof replacement (small): £2,000–£4,000; large: £5,000–£10,000
  Pitched roof replacement: £5,000–£12,000
  New driveway (block paving): £4,000–£8,000
  Landscaping/garden: £2,000–£10,000 depending on scope
  Painting & decorating (full house interior, 3-bed): £3,000–£6,000
  Single room repaint: £300–£800
  Tiling (bathroom floor + walls): £1,500–£3,500
  Flooring (whole house, 3-bed): £3,000–£7,000
  Window replacement (full house, uPVC): £4,000–£8,000
  Fascias/soffits/guttering (semi): £2,000–£4,000
  Damp proofing (single wall): £1,000–£3,000; whole house: £4,000–£10,000
  Fence installation (10m run): £800–£1,500
  Decking (20sqm): £2,000–£4,500
  Chimney removal: £1,500–£4,000
  Garage conversion: £10,000–£20,000
  Porch (brick, enclosed): £5,000–£10,000
  Rendering (full house): £4,000–£8,000
  Underfloor heating (retrofit, per room): £1,500–£3,000
  Structural work (RSJ, knock-through): £2,000–£5,000
  Appliance installation (single, e.g. oven/hob): £100–£300
  Tumble dryer / washing machine install: £50–£150

These are guides — always consider the specific description. Larger \
properties, London/SE locations, listed buildings, structural work, and \
premium materials push towards the upper range or above it.
  materials            - array of material types mentioned (e.g. "oak", \
"plasterboard", "porcelain tile") — empty array if none
  key_concerns         - array of short strings describing what the homeowner \
seems to care about (e.g. "minimising disruption", "structural sign-off", \
"finishing on time before holiday")
  summary              - a single sentence rephrasing the project for an admin

Output ONLY the JSON object. Nothing else.`;

/**
 * A generic-but-realistic stub used in dev/test. Returned as a string so
 * llmClient can store it in the audit log without re-serialising.
 */
const STUB_RESPONSE = JSON.stringify(
  {
    type: "General Builder",
    scope: "medium",
    complexity: "moderate",
    urgency: "flexible",
    recommended_trades: ["General Builder"],
    price_band_estimate: "£5,000–£15,000",
    materials: [],
    key_concerns: ["quality of finish"],
    summary: "Homeowner has a general home-improvement project of moderate scope.",
    __stub: true,
  },
  null,
  2,
);

/**
 * Classify a project. Inserts the result into project_classifications and
 * returns the parsed structured object.
 *
 * Designed to be called fire-and-forget from a route handler. If anything
 * goes wrong, it logs and returns null — never throws into the caller.
 *
 * @param {Object} args
 * @param {Function} args.mysqlQuery   ctx.mysqlQuery
 * @param {number}   args.projectId    DB id of the project being classified
 * @param {string}   args.description  raw free-text description
 * @param {string}   [args.type]       project type from the form (helps the LLM)
 * @param {string}   [args.location]
 * @param {string}   [args.propertyType]
 * @param {number}   [args.bedrooms]
 * @param {Object}   [args.log]        optional logger
 *
 * @returns {Promise<Object|null>}     the structured classification, or null on failure
 */
async function classifyProject({
  mysqlQuery,
  projectId,
  description,
  type,
  location,
  propertyType,
  bedrooms,
  log = console,
}) {
  if (!mysqlQuery) return null;
  if (!Number.isFinite(Number(projectId))) return null;
  if (!description || typeof description !== "string") return null;

  // Build the user prompt — concatenate the form fields so the LLM has
  // context beyond the free text.
  const userPrompt = buildUserPrompt({
    description,
    type,
    location,
    propertyType,
    bedrooms,
  });

  let result;
  try {
    result = await llmClient.complete({
      feature: FEATURE,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      stub: STUB_RESPONSE,
      maxTokens: 800,
      mysqlQuery,
      log,
    });
  } catch (e) {
    log.warn?.("[project-classifier] complete() failed", {
      projectId,
      error: e?.message || e,
    });
    return null;
  }

  // Parse the JSON. Real LLM output sometimes has stray whitespace or a
  // wrapping code fence — strip those defensively.
  const structured = parseJsonResponse(result.text, log);
  if (!structured) {
    log.warn?.("[project-classifier] could not parse JSON response", {
      projectId,
      sample: String(result.text || "").slice(0, 200),
    });
    return null;
  }

  // Persist to project_classifications. Fire-and-forget — if the insert
  // fails we still return the structured result so callers can use it.
  try {
    await mysqlQuery(
      `
      INSERT INTO project_classifications
        (project_id, classifier_version, raw_description, structured, cost_pence, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        Number(projectId),
        CLASSIFIER_VERSION,
        description,
        JSON.stringify(structured),
        result.costPence,
        result.latencyMs,
      ],
    );
  } catch (e) {
    log.warn?.("[project-classifier] insert failed", {
      projectId,
      error: e?.message || e,
    });
  }

  return structured;
}

// ── Internal helpers ────────────────────────────────────────────────

function buildUserPrompt({
  description,
  type,
  location,
  propertyType,
  bedrooms,
}) {
  const lines = ["Classify the following home-improvement project:", ""];
  if (type) lines.push(`Form-selected type: ${type}`);
  if (propertyType) lines.push(`Property type: ${propertyType}`);
  if (Number.isFinite(Number(bedrooms))) lines.push(`Bedrooms: ${bedrooms}`);
  if (location) lines.push(`Location: ${location}`);
  lines.push("");
  lines.push("Free-text description:");
  lines.push(description);
  lines.push("");
  lines.push("Return JSON only.");
  return lines.join("\n");
}

function parseJsonResponse(raw, log) {
  if (!raw) return null;
  let text = String(raw).trim();

  // Strip Markdown fences if Claude wrapped the JSON in them despite being
  // told not to.
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
  classifyProject,
  CLASSIFIER_VERSION,
  FEATURE,
};
