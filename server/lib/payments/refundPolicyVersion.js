// server/lib/payments/refundPolicyVersion.js
//
// Single source of truth for the version stamped against paid orders
// when the consumer waives their 14-day cancellation right under CCR
// 2013. Bump this when the /refund-policy page's lastUpdated changes.

const REFUND_POLICY_VERSION = "2026-05-19";

module.exports = { REFUND_POLICY_VERSION };
