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
  if (!trades.size) return false;
  if (trades.has(candidate.primaryTrade)) return true;
  return (candidate.secondaryTrades || []).some((t) => trades.has(t));
}

function hasAreaMatch(candidate, outward) {
  const areas = candidate.serviceAreas || [];
  return outward && areas.includes(outward);
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
  return (
    hasAnyTradeMatch(candidate, project.classification) ||
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
