// server/lib/sales/scriptPrompt.js
//
// Builds the LLM prompts for the admin sales-script generator. The LLM
// must return ONLY a JSON document of the shape:
//
//   {
//     "categories": [
//       {
//         "name": "About VetMyBuilder",
//         "items": [
//           { "q": "Who are you?", "a": "VetMyBuilder is..." },
//           ...
//         ]
//       },
//       ...
//     ]
//   }
//
// The admin UI renders this as collapsible Q/A grouped by category and
// as a teleprompter feed. Plain text inside `q` and `a` - no markdown,
// no emoji, no fancy quotes.

const SYSTEM_PROMPT = `You are writing a sales-call script for VetMyBuilder, a UK home-improvement marketplace. A human agent will read individual question/answer pairs aloud during a phone call to a prospective tradesperson.

Tone: friendly, plain-English, no jargon, no marketing hype. Sentences short enough to read aloud. Answers 30-90 words each.

Output FORMAT: return ONLY a single JSON document. No prose before or after, no markdown code fences, no commentary. The document must conform to this shape exactly:

{
  "categories": [
    {
      "name": "string - the category label, e.g. 'About VetMyBuilder'",
      "items": [
        { "q": "string - the question or objection", "a": "string - the agent's spoken answer" }
      ]
    }
  ]
}

Required categories (in this order, with these exact names):
1. "About VetMyBuilder" - 4-6 items. Who we are, what the platform does, who it's for, where we operate.
2. "Cost and free trial" - 4-6 items. Pricing tiers, one-off unlocks vs passes, no subscriptions, no contract, what they get for free.
3. "Refunds" - 3-5 items. CCR 2013 waiver, when we refund, when we don't, how to ask.
4. "Why us over Bark / Checkatrade / MyBuilder" - 4-6 items. Differentiators: community-first, no bid spam, transparent ranking, pay-per-message not pay-per-lead.
5. "Common objections" - 4-8 items. Objections phrased as Qs the trade might raise ('I'm already on Checkatrade', 'I'm fully booked', 'Is there a contract?', etc.) with the agent's response.

Optional extra categories: add 1-2 more if the primer suggests them (e.g. 'Verified badge', 'Pilot areas'). Do not exceed 8 categories total.

Constraints:
- Plain ASCII hyphens, never em or en dashes.
- No emoji, no markdown formatting, no asterisks.
- Use straight quotes ("), never curly quotes.
- Do not invent features. If the primer doesn't say it, do not claim it.
- Do not promise insurance, qualifications, or guaranteed work.
`;

function buildUserPrompt(primer) {
  return `Here is the current positioning primer. Use it as the only source of truth for facts about VetMyBuilder. Produce the JSON script per the system instructions.

PRIMER START
${primer}
PRIMER END`;
}

module.exports = { SYSTEM_PROMPT, buildUserPrompt };
