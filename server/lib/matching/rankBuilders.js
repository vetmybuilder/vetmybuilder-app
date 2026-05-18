// server/lib/matching/rankBuilders.js
//
// Pure function. Given a project (with classification + outward code) and
// a list of candidate builders, returns the ranked list of eligible
// builders for the homeowner's swipe deck. Tier 1 (recommended) always
// outranks Tier 2 (subscribed); within each tier, rank by a combined
// score: base reputation + trade match + area match + price-band match.

const AREA_MULTIPLIER = 0.30;
const PRIMARY_TRADE_MULTIPLIER = 0.20;
const SECONDARY_TRADE_MULTIPLIER = 0.10;
const PRICE_BAND_MULTIPLIER = 0.15;

function hasAnyTradeMatch(candidate, classification) {
  const trades = new Set(classification?.recommended_trades || []);
  // No classification yet (AI ranker still pending or project too sparse to
  // classify) - don't filter on trade type. Otherwise the homeowner's deck
  // is empty in the seconds-to-minutes between project create and AI run.
  if (!trades.size) return true;
  // Exact-label match. The classifier rewrites recommended_trades from
  // the canonical project-type → trade map (server/lib/matching/
  // projectTradeMap.js) so labels here always match TRADE_TYPES.label
  // exactly. No fuzzy stemming - drift is a bug worth catching loudly.
  if (trades.has(candidate.primaryTrade)) return true;
  return (candidate.secondaryTrades || []).some((t) => trades.has(t));
}

function hasAreaMatch(candidate, outward) {
  // Project has no extractable outward (free-text location couldn't be
  // parsed) - don't filter on area. Trades who haven't set service_areas
  // are treated as "service anywhere" for cold-start; once they configure
  // areas the explicit list takes over.
  if (!outward) return true;
  const areas = candidate.serviceAreas || [];
  if (areas.length === 0) return true;
  return areas.includes(outward);
}

function computeScore(candidate, project) {
  let score = Number(candidate.baseScore) || 0;
  const classification = project.classification || {};

  if (hasAreaMatch(candidate, project.outward)) {
    score += score * AREA_MULTIPLIER;
  }
  const trades = new Set(classification.recommended_trades || []);
  if (trades.has(candidate.primaryTrade)) {
    score += score * PRIMARY_TRADE_MULTIPLIER;
  } else if ((candidate.secondaryTrades || []).some((t) => trades.has(t))) {
    score += score * SECONDARY_TRADE_MULTIPLIER;
  }
  if (
    classification.price_band_estimate &&
    candidate.priceBand === classification.price_band_estimate
  ) {
    score += score * PRICE_BAND_MULTIPLIER;
  }
  return Math.round(score);
}

function isEligible(candidate, project) {
  // Recommended trades bypass trade-type + area eligibility. A
  // community recommendation is an explicit vouch: the recommender
  // already decided this trade belongs on the shortlist regardless
  // of whether their listed trades match the project's classification
  // (or whether they service the area on paper). Filtering them out
  // here would erase the whole point of the recommendation tier.
  if (candidate.tier === "recommended") return true;

  // Both trade match AND area match must hold for non-recommended
  // candidates. The helpers already return `true` when the
  // corresponding filter is empty (no classification yet, or trade
  // hasn't set service areas), so cold-start projects still surface
  // every approved trade. Once classification is in place the
  // trade-type filter becomes strict, which is what stops Elegant
  // appearing in a Pest Control deck (right-area, wrong trade).
  return (
    hasAnyTradeMatch(candidate, project.classification) &&
    hasAreaMatch(candidate, project.outward)
  );
}

const TIER_ORDER = { recommended: 0, subscribed: 1 };

function rankBuilders({ project, candidates }) {
  const list = Array.isArray(candidates) ? candidates : [];
  const eligible = list.filter((c) => isEligible(c, project));
  const scored = eligible.map((c) => ({
    ...c,
    score: computeScore(c, project),
  }));
  scored.sort((a, b) => {
    const tierDiff =
      (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99);
    if (tierDiff !== 0) return tierDiff;
    return b.score - a.score;
  });
  return scored;
}

module.exports = { rankBuilders };
