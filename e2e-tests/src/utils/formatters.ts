export function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(s: string) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function ensureEndsWithPeriod(s: string) {
  const out = normalize(s);
  if (!out) return out;
  return /[.!?]$/.test(out) ? out : `${out}.`;
}

/**
 * Matches the server-side behaviour in POST /api/projects:
 * - strips full UK postcodes (e.g. "E4 0BQ") down to outward code (e.g. "E4")
 * - keeps everything else unchanged
 */
export function stripFullUkPostcodes(input: string): string {
  const fullPC = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/gi;
  return String(input || "").replace(fullPC, (_, outward) =>
    String(outward).toUpperCase(),
  );
}
