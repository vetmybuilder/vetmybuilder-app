// server/lib/subscriptions.js
//
// Central helpers for subscription + one-off unlock entitlement.
//
// This is just a pure helper module – no DB calls – so it’s safe to
// import from routes like /projects/:id/owner-contact, payments, admin, etc.

/** Normalise a string to lower-case, or fallback */
function norm(value, fallback = "") {
  if (value == null) return fallback;
  return String(value).trim().toLowerCase() || fallback;
}

/**
 * Should this tradesman have global contact access
 * based on their subscription row?
 *
 * We are standardising on:
 *   tradesmen.subscription_status: 'inactive' | 'pending_eligibility' | 'awaiting_payment' | 'active' | 'suspended'
 *   tradesmen.plan:                'free' | 'gold' | 'spotlight' | ...
 *
 * For *now* the only global entitlement we honour is:
 *   status === 'active' AND plan === 'gold'
 */
function hasGlobalContactFromTradesmanRow(tradesmanRow) {
  if (!tradesmanRow) return false;
  const status = norm(tradesmanRow.subscription_status, "inactive");
  const plan = norm(tradesmanRow.plan, "free");
  return status === "active" && plan === "gold";
}

/**
 * Given a raw unlock status from `project_contact_unlocks.status`,
 * decide if this row grants contact entitlement.
 *
 * Planned statuses:
 *   'awaiting_payment'   – Stripe link created, waiting for payment
 *   'pending_admin'      – payment succeeded, but needs admin approval
 *   'approved'           – fully approved, grants entitlement
 *   'rejected'           – admin rejected
 *   'payment_failed'     – payment failed / refunded
 *   'pending_eligibility'– (optional) initial eligibility step
 *
 * For entitlement we only care about 'approved'.
 */
function isOneOffUnlockApproved(status) {
  return norm(status) === "approved";
}

/**
 * Map a raw DB unlock status into a compact client-friendly status
 * string that UI components can switch on.
 *
 * Client-facing values we’ll use:
 *   'not_unlocked'          – no row / nothing in progress
 *   'awaiting_payment'      – Stripe link issued, waiting for payment
 *   'pending_admin_review'  – payment done, waiting for admin
 *   'approved'              – entitlement granted
 *   'rejected'              – explicitly rejected
 *   'payment_failed'        – payment failed or was refunded
 */
function mapUnlockStatusForClient(rawStatus) {
  const s = norm(rawStatus);

  if (!s) return "not_unlocked";

  if (s === "awaiting_payment") return "awaiting_payment";
  if (s === "pending_admin" || s === "pending") return "pending_admin_review";
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "payment_failed" || s === "failed") return "payment_failed";

  // Fallback for unknown future values – treat as "not unlocked"
  return "not_unlocked";
}

module.exports = {
  hasGlobalContactFromTradesmanRow,
  isOneOffUnlockApproved,
  mapUnlockStatusForClient,
};