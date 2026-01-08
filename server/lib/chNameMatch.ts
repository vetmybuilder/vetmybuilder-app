// services/lib/chNameMatch.ts
import Fuse from "fuse.js";
import removeAccents from "remove-accents";
import jaroWinkler from "talisman/metrics/jaro-winkler";
import dice from "talisman/metrics/dice";

// Common noise to ignore when comparing names
const SUFFIX_RE =
  /\b(limited|ltd|llp|plc|company|co\.?|service|services|builder|builders)\b/gi;

function deCamel(s = "") {
  return String(s)
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

function normalizeName(s = "") {
  return removeAccents(s)
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(SUFFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// 0..100 combined score (tuned for company names)
export function scoreCompanyNames(query: string, candidate: string) {
  const q = normalizeName(deCamel(query));
  const c = normalizeName(candidate);
  if (!q || !c) return 0;

  // compact form helps when the user typed a concatenated name
  const qc = q.replace(/\s+/g, "");
  const cc = c.replace(/\s+/g, "");

  const jw = jaroWinkler(qc, cc); // 0..1
  const d = dice(q.split(" "), c.split(" ")); // 0..1

  return Math.round((0.7 * jw + 0.3 * d) * 100); // 0..100
}

/**
 * Given CH search results (array of items with .title/.company_name),
 * returns the top match + a small ranked list.
 */
export function pickBestCompany(
  userInput: string,
  chItems: Array<{ title?: string; company_name?: string }>
) {
  // First pass: shortlist with Fuse
  const fuse = new Fuse(chItems, {
    keys: ["title", "company_name"],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const shortlist =
    fuse
      .search(userInput)
      .map((r) => r.item)
      .slice(0, 20) || [];

  const pool = shortlist.length ? shortlist : chItems.slice(0, 50);

  // Second pass: precise rank with our score
  const ranked = pool
    .map((item) => {
      const name = item.title || (item as any).company_name || "";
      return { item, score: scoreCompanyNames(userInput, name) };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const verdict = !best
    ? "no_match"
    : best.score >= 85
    ? "verified"
    : best.score >= 70
    ? "ambiguous"
    : "ambiguous";

  return {
    verdict,
    best: best || null,
    ranked: ranked.slice(0, 5),
  };
}

/** Optional: build query variants (original, deCamel, suffix-stripped). */
export function buildQueryVariants(name: string) {
  const base = deCamel(name);
  const stripped = base.replace(SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
  const unique = (arr: string[]) => [...new Set(arr.filter(Boolean))];
  return unique([name, base, stripped]);
}
