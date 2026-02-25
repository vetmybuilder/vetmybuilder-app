/* eslint-disable */
const LIVE_BASE = "https://api.company-information.service.gov.uk";
const SANDBOX_BASE = "https://api-sandbox.company-information.service.gov.uk";

// Fuzzy matching libs
const Fuse = require("fuse.js");
const removeAccents = require("remove-accents");
const jaroWinkler =
  require("talisman/metrics/jaro-winkler").default ||
  require("talisman/metrics/jaro-winkler");
const dice =
  require("talisman/metrics/dice").default || require("talisman/metrics/dice");

const TAG = "[CH]";

// -------------------------------------------------------
// Local logger (module-level). Routes may wrap calls with ctx.log.
// -------------------------------------------------------
const log = {
  info: (...a) => console.log(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

/* =======================================================
   CONFIG HELPERS
   ======================================================= */

function resolveKey() {
  return (
    process.env.CH_KEY ||
    process.env.CH_API_KEY ||
    process.env.COMPANIES_HOUSE_API_KEY ||
    ""
  );
}

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

/* =======================================================
   ONE-TIME DIAGNOSTIC ON LOAD
   ======================================================= */
(function bootDiag() {
  const key = resolveKey();
  const base = getBaseUrl();
  const hasKey = !!String(key).trim();
  let sample = "";
  try {
    const b64 = Buffer.from(`${key}:`).toString("base64");
    sample = hasKey ? `${b64.slice(0, 8)}… (len=${b64.length})` : "";
  } catch {}

  log.info(
    `${TAG} init env=${process.env.CH_ENV || "live"} base=${base} key=${
      hasKey ? "present" : "MISSING"
    } auth=${hasKey ? `Basic ${sample}` : "(none)"}`,
  );
})();

// -------------------------------------------------------
// Simple in-memory cache for GET requests (per Node process)
// -------------------------------------------------------
const _chCache = new Map(); // url -> { expiresAt, data }
const _CACHE_TTL_MS = 60 * 1000; // 60s

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function chFetch(pathname, { method = "GET", signal } = {}) {
  const base = getBaseUrl();
  const url = `${base}${pathname}`;

  // cache only GETs
  if (method === "GET") {
    const cached = _chCache.get(url);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        log.info(`${TAG} cache hit ${method} ${pathname}`);
        return cached.data;
      }
      _chCache.delete(url); // cleanup expired
    }
  }

  const headers = {
    Accept: "application/json",
    Authorization: buildAuthHeader(resolveKey()),
    "User-Agent": "vetmybuilder/1.0",
  };

  const maxRetries = 6;
  let attempt = 0;

  while (true) {
    attempt += 1;
    const t0 = Date.now();

    let res;
    try {
      res = await fetch(url, { method, headers, signal });
    } catch (e) {
      const ms = Date.now() - t0;
      log.error(`${TAG} net error ${method} ${pathname} after ${ms}ms`, {
        error: e?.message || e,
      });
      throw e;
    }

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {}

    const ms = Date.now() - t0;

    // Retry on rate limit + transient server errors
    const shouldRetry =
      res.status === 429 || (res.status >= 500 && res.status <= 599);

    if (!res.ok && shouldRetry && attempt < maxRetries) {
      const retryAfter = res.headers.get("retry-after");
      const retryAfterMs =
        retryAfter && /^\d+$/.test(String(retryAfter).trim())
          ? Math.max(0, Number(retryAfter) * 1000)
          : 0;

      const backoffMs = Math.min(5000, 200 * Math.pow(2, attempt - 1)); // 200,400,800...
      const waitMs = Math.max(retryAfterMs, backoffMs);

      log.warn(
        `${TAG} ${method} ${pathname} -> ${res.status} in ${ms}ms (retry ${attempt}/${maxRetries - 1} after ${waitMs}ms)`,
        { body: bodyText?.slice(0, 200) || "(empty)" },
      );

      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      log.error(`${TAG} ${method} ${pathname} -> ${res.status} in ${ms}ms`, {
        body: bodyText?.slice(0, 500) || "(empty)",
      });
      const err = new Error(`CH ${pathname} failed: ${res.status}`);
      err.status = res.status;
      err.body = bodyText;
      throw err;
    }

    log.info(`${TAG} ${method} ${pathname} -> ${res.status} in ${ms}ms`);

    // Parse JSON safely
    let data = null;
    if (bodyText) {
      try {
        data = JSON.parse(bodyText);
      } catch (e) {
        const err = new Error(`CH ${pathname} returned non-JSON body`);
        err.status = res.status;
        err.body = bodyText.slice(0, 500);
        throw err;
      }
    }

    if (method === "GET") {
      _chCache.set(url, { data, expiresAt: Date.now() + _CACHE_TTL_MS });
    }

    return data;
  }
}

/* =======================================================
   BASIC CH ENDPOINTS
   ======================================================= */

async function searchCompanies({ name, itemsPerPage = 50 }) {
  const q = encodeURIComponent(name);
  const ipp = Math.max(1, Math.min(100, itemsPerPage));
  const path = `/search/companies?q=${q}&items_per_page=${ipp}`;

  const data = await chFetch(path);
  const count = Array.isArray(data?.items) ? data.items.length : 0;

  log.info(`${TAG} search "${name}" -> items=${count}`);
  return data;
}

async function getCompanyProfile(companyNumber) {
  const num = String(companyNumber || "").trim();

  log.info(`${TAG} profile num=${num}`);

  if (!/^\d{6,8}$/.test(num)) {
    const e = new Error("Invalid companyNumber");
    e.status = 400;
    throw e;
  }

  const data = await chFetch(`/company/${num}`);
  const status = String(data?.company_status || "").toLowerCase();

  log.info(`${TAG} profile ok num=${num} status=${status}`);

  return data;
}

/* =======================================================
   MATCHING / SCORING UTILS  (unchanged behaviour)
   ======================================================= */

const CONSTRUCTION_SIC_PREFIXES = ["41", "42", "43"];
const FINE_SIC_WHITELIST = new Set([
  "43310",
  "43330",
  "43341",
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

function deCamel(s = "") {
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
  const b = normName(deCamel(qName));
  if (!a || !(b || b0)) return 0;

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

  const ac = compact(a);
  const bc = compact(b || b0);
  if (ac === bc) return 70;
  if (ac.startsWith(bc) || bc.startsWith(ac)) return 55;
  if (ac.includes(bc) || bc.includes(ac)) return 35;

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
  const nameOK = nameScore(item.title, qName) >= 60;
  const locOK = addressMatchesHint(profile, locHint);
  return active && inConstruction && (nameOK || locOK);
}

function buildScore({ item, profile, qName, locHint }) {
  let score = 0;
  score += nameScore(item.title, qName);
  score += statusScore(profile);
  if (hasConstructionSIC(profile?.sic_codes)) score += 10;
  if (addressMatchesHint(profile, locHint)) score += 5;
  score += companyAgeBoost(profile);
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

/* =======================================================
   FUZZY MATCHING HELPERS
   ======================================================= */

const SUFFIX_RE =
  /\b(limited|ltd|llp|plc|company|co\.?|service|services|builder|builders)\b/gi;

function normalizeForFuse(s = "") {
  return removeAccents(
    deCamel(String(s))
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(SUFFIX_RE, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).toLowerCase();
}

function compactNoSpace(s = "") {
  return normalizeForFuse(s).replace(/\s+/g, "");
}

function fuzzyNameScore(query, candidate) {
  const q = normalizeForFuse(query);
  const c = normalizeForFuse(candidate);
  if (!q || !c) return 0;

  const jw = jaroWinkler(compactNoSpace(q), compactNoSpace(c));
  const d = dice(q.split(" "), c.split(" "));
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
    .map((item) => ({
      item,
      score: fuzzyNameScore(userInput, item.title || item.company_name || ""),
    }))
    .sort((a, b) => b.score - a.score);

  log.info(`${TAG} pickBest`, {
    input: userInput,
    pool: pool.length,
    top3: ranked.slice(0, 3).map((r) => ({
      number: r.item?.company_number,
      title: r.item?.title,
      score: r.score,
    })),
  });

  const best = ranked[0];
  const verdict = !best
    ? "no_match"
    : best.score >= 85
      ? "verified"
      : best.score >= 70
        ? "ambiguous"
        : "ambiguous";

  return { verdict, best, ranked: ranked.slice(0, 5) };
}

function buildQueryVariants(name) {
  const base = deCamel(name);
  const stripped = base.replace(SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
  const unique = (arr) => [...new Set(arr.filter(Boolean))];
  return unique([name, base, stripped]);
}

/* =======================================================
   PUBLIC: matchByName (MAIN ENTRY)
   ======================================================= */

async function matchByName({ name, locationHint }) {
  log.info(`${TAG} matchByName`, {
    name,
    hint: locationHint || "",
  });

  const variants = buildQueryVariants(name);

  const allItems = [];
  const seen = new Set();

  for (const q of variants) {
    try {
      const search = await searchCompanies({ name: q });
      const items = Array.isArray(search?.items) ? search.items : [];

      log.info(`${TAG} variant "${q}" got ${items.length} items`);

      for (const it of items) {
        const key = String(it?.company_number || "").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!it.title && it.company_name) it.title = it.company_name;
        allItems.push(it);
      }
    } catch (e) {
      log.warn(`${TAG} variant "${q}" failed`, { error: e?.message || e });
    }
  }

  log.info(`${TAG} merged unique items=${allItems.length}`);

  if (!allItems.length) {
    log.info(`${TAG} no items – verdict=no_match`);
    return { verdict: "no_match", best: null, candidates: [] };
  }

  const ranked = pickBestCompany(name, allItems);

  const topItems =
    (ranked.ranked || []).map((x) => x.item).slice(0, 10) ||
    allItems.slice(0, 10);

  const profiles = await Promise.all(
    topItems.map(async (i) => {
      try {
        return await getCompanyProfile(i.company_number);
      } catch (e) {
        log.warn(`${TAG} profile fetch fail`, {
          num: i.company_number,
          error: e?.message || e,
        });
        return null;
      }
    }),
  );

  const scored = topItems
    .map((it, idx) => ({
      item: it,
      profile: profiles[idx],
      score: profiles[idx]
        ? buildScore({
            item: it,
            profile: profiles[idx],
            qName: name,
            locHint: locationHint,
          })
        : 0,
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0] || null;

  if (!best) {
    log.info(`${TAG} scored empty => verdict=no_match`);
    return { verdict: "no_match", best: null, candidates: [] };
  }

  const verdict =
    best.score >= 85
      ? "verified"
      : best.score >= 70
        ? "ambiguous"
        : "ambiguous";

  const out = {
    verdict,
    best: serialize(best),
    candidates: scored.slice(0, 3).map(serialize),
  };

  log.info(`${TAG} final verdict`, {
    verdict,
    best: out.best,
  });

  return out;
}

/* =======================================================
   DEBUG DIAGNOSTIC
   ======================================================= */

function chDiag() {
  const key = String(resolveKey() || "").trim();
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
