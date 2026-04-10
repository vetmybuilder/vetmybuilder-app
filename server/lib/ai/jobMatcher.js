// server/lib/ai/jobMatcher.js
//
// Pure scoring function for matching projects to tradesmen.
// No AI, no DB calls — just data in, score out.

/**
 * Score how relevant a project is to a tradesman.
 *
 * @param {Object} args
 * @param {string[]} args.tradesmanTrades   - e.g. ["Plumber", "Bathroom Fitter"]
 * @param {string[]} args.tradesmanAreas    - e.g. ["E4", "N17", "E17"]
 * @param {string}   args.projectType       - from projects.type, e.g. "Bathroom"
 * @param {string}   args.projectLocation   - outward postcode, e.g. "E4"
 * @param {string[]} args.recommendedTrades  - from classification, e.g. ["Plumber", "Tiler"]
 * @param {Date|string} args.projectCreatedAt
 * @returns {{ total: number, trade: number, location: number, recency: number }}
 */
function scoreMatch({
  tradesmanTrades = [],
  tradesmanAreas = [],
  projectType = "",
  projectLocation = "",
  recommendedTrades = [],
  projectCreatedAt,
}) {
  const trade = scoreTrade(tradesmanTrades, recommendedTrades, projectType);
  const location = scoreLocation(tradesmanAreas, projectLocation);
  const recency = scoreRecency(projectCreatedAt);
  return { total: trade + location + recency, trade, location, recency };
}

function scoreTrade(tradesmanTrades, recommendedTrades, projectType) {
  const normTrades = tradesmanTrades.map((t) => t.trim().toLowerCase());
  const normRec = recommendedTrades.map((t) => t.trim().toLowerCase());

  // Full match: any of the classifier's recommended trades is in the tradesman's list
  if (normRec.length > 0 && normRec.some((r) => normTrades.includes(r))) {
    return 60;
  }

  // Partial match: the project's form-selected type matches a trade
  // Uses substring or shared-prefix matching (e.g. "Plumber" ~ "Plumbing")
  const normType = (projectType || "").trim().toLowerCase();
  if (normType && normTrades.some((t) => fuzzyTradeMatch(t, normType))) {
    return 30;
  }

  return 0;
}

function fuzzyTradeMatch(trade, type) {
  if (trade.includes(type) || type.includes(trade)) return true;
  // Stem-like match: if both share a prefix of at least 4 characters
  const minLen = Math.min(trade.length, type.length);
  let shared = 0;
  for (let i = 0; i < minLen; i++) {
    if (trade[i] === type[i]) shared++;
    else break;
  }
  return shared >= 4;
}

function scoreLocation(tradesmanAreas, projectLocation) {
  if (!projectLocation) return 0;
  const normLoc = projectLocation.trim().toUpperCase();
  const normAreas = tradesmanAreas.map((a) => a.trim().toUpperCase());

  // Exact match on outward code
  if (normAreas.includes(normLoc)) return 30;

  // First-letter match (same broad London area: E4 matches E17)
  const locPrefix = normLoc.charAt(0);
  if (locPrefix && normAreas.some((a) => a.charAt(0) === locPrefix)) return 15;

  return 0;
}

function scoreRecency(createdAt) {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  const ageMs = Date.now() - created.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours <= 24) return 10;
  if (ageHours <= 72) return 5;
  return 0;
}

module.exports = { scoreMatch };
