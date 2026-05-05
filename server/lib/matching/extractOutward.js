// server/lib/matching/extractOutward.js
//
// Free-text location → UK outward code (e.g. "E4", "SW1A").
// `projects.location` is a TEXT column with whatever the homeowner typed;
// tradesmen.service_areas stores outward codes. This helper bridges the
// two at read time so we don't have to add a derived column today.

const OUTWARD_RE = /([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}/i; // full postcode → outward
const OUTWARD_FALLBACK_RE = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/i;   // outward only

function extractOutward(text) {
  if (!text || typeof text !== "string") return null;
  const s = text.toUpperCase();
  const full = s.match(OUTWARD_RE);
  if (full) return full[1];
  const bare = s.match(OUTWARD_FALLBACK_RE);
  if (bare) return bare[1];
  return null;
}

module.exports = { extractOutward };
