// server/lib/phone.js

/**
 * Strip non-digit/non-plus characters. Returns null on empty.
 */
function cleanPhone(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  const compact = s.replace(/[^\d+]/g, "");
  return compact || null;
}

/**
 * UK-only phone validator. Accepts landlines (01/02/03), mobiles (07),
 * and non-geographic numbers (08). Leading "0" or "+44" both OK.
 * Spaces/dashes/parens are stripped before matching.
 */
function isValidUKPhone(input) {
  if (input == null) return false;
  const s = String(input).replace(/[\s\-()]/g, "");
  if (!s) return false;
  return /^(?:\+44|0)[12378]\d{9}$/.test(s);
}

module.exports = { cleanPhone, isValidUKPhone };
