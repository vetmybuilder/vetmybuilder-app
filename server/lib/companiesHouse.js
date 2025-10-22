/* eslint-disable */
const LIVE_BASE = "https://api.company-information.service.gov.uk";
const SANDBOX_BASE = "https://api-sandbox.company-information.service.gov.uk";

// --- NEW: fuzzy matching libs
const Fuse = require("fuse.js");
const removeAccents = require("remove-accents");
const jaroWinkler =
  require("talisman/metrics/jaro-winkler").default ||
  require("talisman/metrics/jaro-winkler");
const dice =
  require("talisman/metrics/dice").default || require("talisman/metrics/dice");

/** Build correct Basic header: base64("<key>:") */
function buildAuthHeader(rawKey) {
  const key = String(rawKey || "").trim();
  if (!key) throw new Error("CH_KEY missing");
  const encoded = Buffer.from(`${key}:`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

function getBaseUrl() {
  const env = (process.env.CH_ENV || "live").toLowerCase();
  return env === "sandbox" ? SANDBOX_BASE : LIVE_BASE;
}

async function chFetch(pathname, { method = "GET", signal } = {}) {
  const base = getBaseUrl();
  const url = `${base}${pathname}`;
  const headers = {
    Accept: "application/json",
    Authorization: buildAuthHeader(process.env.CH_KEY),
    "User-Agent": "vetmybuilder/1.0",
  };

  const res = await fetch(url, { method, headers, signal });

  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {}
  if (!res.ok) {
    const msg = `CH ${pathname} failed: ${res.status} ${bodyText || ""}`.trim();
    const err = new Error(msg);
    err.status = res.status;
    err.body = bodyText;
    throw err;
  }
  return bodyText ? JSON.parse(bodyText) : null;
}

async function searchCompanies({ name, itemsPerPage = 50 }) {
  const q = encodeURIComponent(name);
  const ipp = Math.max(1, Math.min(100, itemsPerPage));
  return chFetch(`/search/companies?q=${q}&items_per_page=${ipp}`);
}

async function getCompanyProfile(companyNumber) {
  const num = String(companyNumber || "").trim();
  if (!/^\d{6,8}$/.test(num)) {
    const e = new Error("Invalid companyNumber");
    e.status = 400;
    throw e;
  }
  return chFetch(`/company/${num}`);
}

/* ---------------- Scoring utilities ---------------- */

const CONSTRUCTION_SIC_PREFIXES = ["41", "42", "43"];
const FINE_SIC_WHITELIST = new Set([
  "43310",
  "43330",
  "43341", // plastering, floor/wall covering, painting
  "41201",
  "41202",
  "43210",
  "43220",
  "43290",
  "43320",
  "43342",
  "43390",
  "43910",
  "43991",
  "43999",
]);

// --- helpers for name normalization ---
function deCamel(s = "") {
  // PRHenryBuilder -> PR Henry Builder, XMLParserX -> XML Parser X
  return String(s)
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

function compact(s = "") {
  return String(s).replace(/\s+/g, "");
}

function normName(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[.,'"]/g, "")
    .replace(/\b(limited|ltd|llp|plc)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameScore(aTitle, qName) {
  const a = normName(aTitle);
  const b0 = normName(qName);
  const b = normName(deCamel(qName)); // try de-camelized query

  if (!a || !(b || b0)) return 0;

  // Exact/starts/includes on normalized names
  if (a === b || a === b0) return 70;
  if (
    a.startsWith(b) ||
    b.startsWith(a) ||
    a.startsWith(b0) ||
    b0.startsWith(a)
  )
    return 55;
  if (a.includes(b) || b.includes(a) || a.includes(b0) || b0.includes(a))
    return 35;

  // Compact (no-space) comparisons catch PRHenryBuilder vs "pr henry builder"
  const ac = compact(a);
  const bc = compact(b || b0);
  if (ac === bc) return 70;
  if (ac.startsWith(bc) || bc.startsWith(ac)) return 55;
  if (ac.includes(bc) || bc.includes(ac)) return 35;

  // Token overlap (Jaccard-ish) gives partial credit on shuffled words
  const aT = new Set(a.split(" ").filter(Boolean));
  const bT = new Set((b || b0).split(" ").filter(Boolean));
  const inter = [...aT].filter((t) => bT.has(t)).length;
  const j = inter / Math.max(1, bT.size);
  if (j >= 0.8) return 60;
  if (j >= 0.6) return 45;
  if (j >= 0.4) return 30;

  return 0;
}

function hasConstructionSIC(sics = []) {
  const arr = Array.isArray(sics) ? sics : [];
  if (arr.some((c) => FINE_SIC_WHITELIST.has(String(c)))) return true;
  return arr.some((c) => {
    const s = String(c || "");
    return CONSTRUCTION_SIC_PREFIXES.includes(s.slice(0, 2));
  });
}

function addressMatchesHint(profile, hint) {
  if (!hint) return false;
  const addr = profile?.registered_office_address || {};
  const blob = [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.postal_code,
    addr.country,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return blob.includes(String(hint).toLowerCase());
}

function companyAgeBoost(profile) {
  const iso = profile?.date_of_creation;
  if (!iso) return 0;
  const ageMs = Date.now() - Date.parse(iso);
  const sixMonths = 1000 * 60 * 60 * 24 * 30 * 6;
  return ageMs >= sixMonths ? 5 : 0;
}

function statusScore(profile) {
  const s = String(profile?.company_status || "").toLowerCase();
  if (s === "active") return 10;
  if (s === "dissolved") return -30;
  return 0;
}

function hasStrongEvidence({ item, profile, qName, locHint }) {
  const active =
    String(profile?.company_status || "").toLowerCase() === "active";
  const inConstruction = hasConstructionSIC(profile?.sic_codes);
  const nameOK = nameScore(item.title, qName) >= 60; // solid name match
  const locOK = addressMatchesHint(profile, locHint); // optional
  return active && inConstruction && (nameOK || locOK);
}

function buildScore({ item, profile, qName, locHint }) {
  let score = 0;
  score += nameScore(item.title, qName);
  score += statusScore(profile);
  if (hasConstructionSIC(profile?.sic_codes)) score += 10;
  if (addressMatchesHint(profile, locHint)) score += 5;
  score += companyAgeBoost(profile);

  // NEW: if it's clearly the right, active construction company, bump to Verified threshold
  if (hasStrongEvidence({ item, profile, qName, locHint })) {
    score = Math.max(score, 85);
  }

  return Math.max(0, Math.min(score, 100));
}

function serialize(entry) {
  const p = entry.profile || {};
  return {
    score: entry.score,
    number: p.company_number || entry.item?.company_number || null,
    name: p.company_name || entry.item?.title || null,
    status: p.company_status || null,
    dateOfCreation: p.date_of_creation || null,
    sicCodes: p.sic_codes || [],
    address: p.registered_office_address || null,
  };
}

/* ---------------- NEW: Fuzzy shortlist helpers ---------------- */

const SUFFIX_RE =
  /\b(limited|ltd|llp|plc|company|co\.?|service|services|builder|builders)\b/gi;

function normalizeForFuse(s = "") {
  return removeAccents(
    deCamel(String(s))
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(SUFFIX_RE, " ")
      .replace(/\s+/g, " ")
      .trim()
  ).toLowerCase();
}

function compactNoSpace(s = "") {
  return normalizeForFuse(s).replace(/\s+/g, "");
}

// 0..100 combined score (tuned for company names)
function fuzzyNameScore(query, candidate) {
  const q = normalizeForFuse(query);
  const c = normalizeForFuse(candidate);
  if (!q || !c) return 0;

  const jw = jaroWinkler(compactNoSpace(q), compactNoSpace(c)); // 0..1
  const d = dice(q.split(" "), c.split(" ")); // 0..1
  return Math.round((0.7 * jw + 0.3 * d) * 100);
}

function pickBestCompany(userInput, chItems) {
  const fuse = new Fuse(chItems, {
    keys: ["title", "company_name"],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const shortlist = fuse
    .search(userInput)
    .map((r) => r.item)
    .slice(0, 20);
  const pool = shortlist.length ? shortlist : chItems.slice(0, 50);

  const ranked = pool
    .map((item) => {
      const name = item.title || item.company_name || "";
      return { item, score: fuzzyNameScore(userInput, name) };
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

  return { verdict, best: best || null, ranked: ranked.slice(0, 5) };
}

function buildQueryVariants(name) {
  const base = deCamel(name);
  const stripped = base.replace(SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
  const unique = (arr) => [...new Set(arr.filter(Boolean))];
  return unique([name, base, stripped]);
}

/* ---------------- Matching ---------------- */

// Public: best-effort verify by name(+optional postcode/city)
// Uses fuzzy shortlist (Fuse+Talisman) then your buildScore to finalize.
async function matchByName({ name, locationHint }) {
  // 1) Query CH with a few variants to be tolerant of PRHenryBuilder, LTD/LLP noise, etc.
  const variants = buildQueryVariants(name);
  const allItems = [];
  const seen = new Set();

  for (const q of variants) {
    try {
      const search = await searchCompanies({ name: q });
      const items = Array.isArray(search?.items) ? search.items : [];
      for (const it of items) {
        const key = String(it?.company_number || "").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        // normalize property to "title" for consistency
        if (!it.title && it.company_name) it.title = it.company_name;
        allItems.push(it);
      }
    } catch {
      // ignore this variant and continue
    }
  }

  if (!allItems.length) {
    return { verdict: "no_match", best: null, candidates: [] };
  }

  // 2) Fuzzy shortlist/rank by name similarity
  const ranked = pickBestCompany(name, allItems); // { verdict, best, ranked }

  // Take up to 10 best-ranked items for profiles (fallback to raw if empty)
  const topItems =
    (ranked.ranked || []).map((x) => x.item).slice(0, 10) ||
    allItems.slice(0, 10);
  const top = topItems.filter((i) => i && i.company_number);

  // 3) Fetch profiles for the shortlist
  const profs = await Promise.all(
    top.map(async (i) => {
      try {
        return await getCompanyProfile(i.company_number);
      } catch {
        return null;
      }
    })
  );

  // 4) Final scoring using your existing buildScore (keeps SIC/status/age/location signals)
  const scored = top
    .map((it, idx) => {
      const profile = profs[idx];
      const score = profile
        ? buildScore({
            item: it,
            profile,
            // use the original search text; your buildScore normalizer handles spacing
            qName: name,
            locHint: locationHint,
          })
        : 0;
      return { item: it, profile, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0] || null;

  // 5) Thresholds unchanged (70/85)
  if (!best) {
    return { verdict: "no_match", best: null, candidates: [] };
  }
  if (best.score < 70) {
    return {
      verdict: "ambiguous",
      best: serialize(best),
      candidates: scored.slice(0, 3).map(serialize),
    };
  }
  return {
    verdict: best.score >= 85 ? "verified" : "ambiguous",
    best: serialize(best),
    candidates: scored.slice(0, 3).map(serialize),
  };
}

function chDiag() {
  const key = String(process.env.CH_KEY || "").trim();
  const hasKey = !!key;
  const base = getBaseUrl();
  let sample = "";
  try {
    const b64 = Buffer.from(`${key}:`).toString("base64");
    sample = hasKey ? `${b64.slice(0, 8)}… (len=${b64.length})` : "";
  } catch {}
  return {
    env: process.env.CH_ENV || "live",
    base,
    hasKey,
    authHeaderLooksLike: hasKey ? `Basic ${sample}` : "(missing)",
  };
}

module.exports = {
  searchCompanies,
  getCompanyProfile,
  matchByName,
  chDiag,
};
