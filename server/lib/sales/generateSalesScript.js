// server/lib/sales/generateSalesScript.js
//
// One-shot generator: takes the current primer + a ctx (mysqlQuery for
// log writing) and returns a JSON string conforming to the shape the
// admin UI consumes (categories -> items[{q,a}]). Stub mode returns a
// deterministic skeleton so tests + E2E don't bill Anthropic.

const { complete } = require("../ai/llmClient");
const { SYSTEM_PROMPT, buildUserPrompt } = require("./scriptPrompt");

const STUB_OBJECT = {
  categories: [
    {
      name: "About VetMyBuilder",
      items: [
        {
          q: "Who are you?",
          a: "VetMyBuilder is a UK home-improvement marketplace that connects homeowners with vetted tradespeople through community recommendations - friends, neighbours, past clients - rather than anonymous bids.",
        },
        {
          q: "How does the platform work?",
          a: "Homeowners post a job, their community recommends tradespeople they trust, and we add smart-ranked matches alongside. Trades and homeowners swipe to express interest; a mutual right-swipe opens a chat.",
        },
        {
          q: "Where do you operate?",
          a: "We're starting in Waltham Forest as the pilot borough - E4, E10, E11 and E17. Other London boroughs are next.",
        },
        {
          q: "Who's this for?",
          a: "Independent tradespeople and small UK-registered limited companies who rely on word-of-mouth and want a better source of leads than the pay-per-click sites.",
        },
      ],
    },
    {
      name: "Cost and free trial",
      items: [
        {
          q: "How much does it cost?",
          a: "No monthly fee, no subscription. A one-off unlock to message one homeowner is between £2.99 and £14.99 depending on the job's size. Time-limited passes start at £3.99 for a week.",
        },
        {
          q: "Is there a free trial?",
          a: "Signing up is free. Building your profile is free. You only ever pay when you actively choose to message a homeowner who isn't already in your community network.",
        },
        {
          q: "What do the access passes cost?",
          a: "Seven-day pass is £3.99, fourteen-day is £6.99, and thirty-day is £9.99 - that's our best value at thirty-three pence a day. Pick whichever matches your work pipeline.",
        },
        {
          q: "Do I get billed automatically?",
          a: "No. Every purchase is a one-off. Nothing renews. When a pass expires you buy a new one if you still want unlimited messaging.",
        },
      ],
    },
    {
      name: "Refunds",
      items: [
        {
          q: "Can I get a refund?",
          a: "Yes - if you were charged in error, if a bug stopped your unlock activating, or if our platform was down for a meaningful stretch of your pass. Email hello@vetmybuilder.com and we'll review every case.",
        },
        {
          q: "What about the 14-day cancellation right?",
          a: "Under UK Consumer Contracts Regulations 2013, that right is waived for digital services delivered immediately. You tick a box at checkout to confirm that - the policy page explains it in plain English.",
        },
        {
          q: "What if the homeowner doesn't reply?",
          a: "That alone isn't a refund reason - the contact details and the right to message are what you paid for, and we delivered them. We do refund at our discretion if something exceptional happened, so ask.",
        },
      ],
    },
    {
      name: "Why us over Bark / Checkatrade / MyBuilder",
      items: [
        {
          q: "Why not just stay on Bark?",
          a: "Bark sells you leads and you pay whether or not the homeowner responds. We sell the message itself - you only pay when you've seen the job and decided you actually want to talk.",
        },
        {
          q: "How is this different from Checkatrade?",
          a: "Checkatrade charges a monthly fee for a directory listing. We don't. We let homeowners' own community surface trusted trades first, and the ranking we add is published openly on our /ranking page.",
        },
        {
          q: "What about MyBuilder?",
          a: "MyBuilder is bid-based - lots of trades chasing one job. We're community-first - the homeowner sees people their network already recommends before anyone else, and there's no bidding war.",
        },
        {
          q: "Can I keep my other listings?",
          a: "Absolutely. Lots of our trades run multiple sources. We're a new channel, not a replacement - the test is whether the leads here are better quality and lower cost.",
        },
      ],
    },
    {
      name: "Common objections",
      items: [
        {
          q: "I'm already on Checkatrade.",
          a: "Totally understand. Keep them running - lots of our trades do. The difference here is you pay per message, not per lead. No monthly fee, no waste on jobs you wouldn't have wanted anyway.",
        },
        {
          q: "I'm not taking new work right now.",
          a: "No problem - we'll keep your profile dormant. Want me to send a quick follow-up email in a few weeks when you're ready to look again?",
        },
        {
          q: "Is there a contract?",
          a: "No contract, no auto-renewal. Every purchase is a one-off. You can walk away whenever you like and we don't hold anything against you.",
        },
        {
          q: "How do I know the leads are real?",
          a: "Every job is posted by a verified homeowner with a real postcode in our pilot area. You see the job details before you pay - and you only pay when you actively decide it's a job you want.",
        },
        {
          q: "Can I see the homeowner first?",
          a: "Yes - you see the job, the location at outward-postcode level, the type of work and budget band before unlocking. The exact address comes after you've decided to reach out.",
        },
      ],
    },
  ],
};

const STUB_JSON = JSON.stringify(STUB_OBJECT, null, 2);

async function generateSalesScript({ primer, mysqlQuery, log = console }) {
  const result = await complete({
    feature: "sales_script",
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(primer),
    stub: STUB_JSON,
    maxTokens: 3500,
    mysqlQuery,
    log,
  });
  const text = (result?.text || "").trim();
  if (!text) {
    throw new Error("LLM returned empty response");
  }

  // Strip any accidental ```json fences the model added.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    throw new Error(
      `LLM returned non-JSON: ${e?.message || "parse failed"}`,
    );
  }
  if (!parsed || !Array.isArray(parsed.categories)) {
    throw new Error("LLM response missing categories[] array");
  }
  // Re-serialise so we always store canonical, formatted JSON.
  return JSON.stringify(parsed, null, 2);
}

module.exports = { generateSalesScript, STUB_JSON, STUB_OBJECT };
