export function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a regex that matches an href value with or without a trailing
 * slash. Browsers normalize bare URLs by appending "/" (e.g.
 * "https://example.com" → "https://example.com/"), so a strict equality
 * assertion fails. Use this anywhere you assert on `<a href="...">`.
 */
export function hrefMatcher(url: string): RegExp {
  const stripped = url.replace(/\/$/, "");
  return new RegExp(`^${escapeRegExp(stripped)}/?$`);
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

/**
 * MySQL returns JSON columns either as a parsed object (when the mysql2
 * driver option is enabled) or as a string. Tests/API helpers should be
 * tolerant of either shape.
 */
export function parseAnswersJson(raw: unknown): Record<string, any> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as Record<string, any>;
  return null;
}
