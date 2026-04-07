// server/lib/hireContactResolution.js
//
// Decides how (and whether) we can reach out to a tradesman associated with a
// recommendation that hasn't yet joined the platform.
//
// The chain is intentionally simple right now:
//
//   1. If the recommendation has a `companyEmail` → channel = "email"
//   2. Otherwise → channel = "manual" (admin queue picks it up later)
//
// SMS was originally on the chain but dropped — there's no SMS provider
// integrated. Companies House email lookup was also dropped: the API doesn't
// return contact info, only registered office address.

const crypto = require("node:crypto");

/**
 * @param {{ companyEmail?: string|null, company?: string|null }} recommendation
 * @returns {{ channel: "email" | "manual", email: string | null, token: string | null }}
 */
function resolveHireContact(recommendation) {
  const email =
    typeof recommendation?.companyEmail === "string"
      ? recommendation.companyEmail.trim()
      : "";

  if (email) {
    return {
      channel: "email",
      email,
      token: generateInviteToken(),
    };
  }

  return {
    channel: "manual",
    email: null,
    token: null,
  };
}

/**
 * 32 bytes of randomness, hex-encoded → 64-char token. Stored on the hire row
 * and used as the magic-link path segment when sending an invite email.
 */
function generateInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  resolveHireContact,
  generateInviteToken,
};
