// server/lib/subscriptions/tiers.js
//
// Single source of truth for builder-subscription tiers. Consumed by
// the checkout route (to build Stripe price_data) and the webhook
// handler (to verify a session's line_item maps to a known tier).

const TIERS = Object.freeze({
  week_1: Object.freeze({
    id: "week_1",
    displayName: "1 week",
    amountPence: 399,
    interval: "week",
    intervalCount: 1,
  }),
  week_2: Object.freeze({
    id: "week_2",
    displayName: "2 weeks",
    amountPence: 599,
    interval: "week",
    intervalCount: 2,
  }),
  month_1: Object.freeze({
    id: "month_1",
    displayName: "1 month",
    amountPence: 999,
    interval: "month",
    intervalCount: 1,
  }),
});

function getTier(id) {
  if (!id || typeof id !== "string") return null;
  return TIERS[id] || null;
}

function isValidTier(id) {
  return !!getTier(id);
}

module.exports = { TIERS, getTier, isValidTier };
