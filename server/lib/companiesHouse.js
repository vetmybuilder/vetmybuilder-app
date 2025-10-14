// server/lib/companiesHouse.js
/* eslint-disable */
const LIVE_BASE = "https://api.company-information.service.gov.uk";
const SANDBOX_BASE = "https://api-sandbox.company-information.service.gov.uk";

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
  "43999"
]);

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
  const b = normName(qName);
  if (!a || !b) return 0;
  if (a === b) return 70;
  if (a.startsWith(b) || b.startsWith(a)) return 55;
  if (a.includes(b) || b.includes(a)) return 35;
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

function buildScore({ item, profile, qName, locHint }) {
  let score = 0;
  score += nameScore(item.title, qName);
  score += statusScore(profile);
  if (hasConstructionSIC(profile?.sic_codes)) score += 10;
  if (addressMatchesHint(profile, locHint)) score += 5;
  score += companyAgeBoost(profile);
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

// Public: best-effort verify by name(+optional postcode/city)
async function matchByName({ name, locationHint }) {
  const search = await searchCompanies({ name });
  const items = Array.isArray(search?.items) ? search.items : [];
  if (!items.length) return { verdict: "no_match", best: null, candidates: [] };

  // Fetch profiles for top 10 search hits
  const top = items.slice(0, 10).filter((i) => i?.company_number);
  const profs = await Promise.all(
    top.map(async (i) => {
      try {
        return await getCompanyProfile(i.company_number);
      } catch {
        return null;
      }
    })
  );

  const scored = top
    .map((it, idx) => {
      const profile = profs[idx];
      const score = profile
        ? buildScore({ item: it, profile, qName: name, locHint: locationHint })
        : 0;
      return { item: it, profile, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0] || null;
  if (!best || best.score < 70) {
    return {
      verdict: best ? "ambiguous" : "no_match",
      best: best ? serialize(best) : null,
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
