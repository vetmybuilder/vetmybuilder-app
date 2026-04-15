// server/lib/googlePlaces.js
//
// Helper used by recommendations/verification.get.js
// to look up a business in Google Places by name (+ optional location hint).

const { isExternalServicesMocked } = require("./externalServices");
const gpCache = require("./googlePlacesCache");
const {
  syntheticGooglePlace,
  syntheticPlaceDetails,
} = require("./mocks/syntheticExternal");

const TAG = "[googlePlaces]";

// -------------------------------------
// Logger (module-level)
// -------------------------------------
const log = {
  info: (...a) => console.log(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

// Try global fetch (Node 18+); fallback to node-fetch if present
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    // no fetch implementation — handled later
  }
}

// Bring in fuzzy name score helper if available
const { _roughNameScore } = (() => {
  try {
    return require("./companyVerifyHelpers");
  } catch {
    return { _roughNameScore: () => 0 };
  }
})();

const MIN_GOOGLE_NAME_SCORE = 82;

// -------------------------------------
// Name normalisation helpers
// -------------------------------------
function normaliseNameForScore(input) {
  if (!input) return "";
  let s = String(input).toUpperCase().trim();
  s = s.replace(/\b(LTD|LIMITED|LTD\.|LIMTED|PLC|LLP)\b/g, "").trim();
  s = s.replace(/\s+/g, " ");
  return s;
}

function namesRoughlyMatch(a, b) {
  const aa = normaliseNameForScore(a);
  const bb = normaliseNameForScore(b);
  if (!aa || !bb) return false;

  try {
    const n = Number(_roughNameScore(aa, bb));
    if (!Number.isFinite(n)) return false;

    log.info(`${TAG} nameScore`, { query: aa, google: bb, score: n });
    return n >= MIN_GOOGLE_NAME_SCORE;
  } catch (e) {
    log.warn(`${TAG} roughNameScore failed, fallback strict`, {
      error: e?.message || e,
    });
    return aa === bb;
  }
}

// -------------------------------------
// Main Google Places Lookup
// -------------------------------------
async function lookupBusiness({ name, locationHint, companyNumber }) {
  // Hard kill-switch — never fire a billable Places request when the
  // process is in mocked-services mode (e2e CI / tests). Return a
  // deterministic synthetic result so the UI still renders rating /
  // verification badges instead of a blank "no data" state.
  if (isExternalServicesMocked()) {
    const synth = syntheticGooglePlace({ name });
    log.info(`${TAG} mocked — synthetic Google place`, {
      name,
      placeId: synth?.placeId,
      rating: synth?.rating,
    });
    return synth;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    log.warn(`${TAG} GOOGLE_PLACES_API_KEY not set – skipping Google lookup`);
    return null;
  }

  if (!fetchFn) {
    log.warn(
      `${TAG} fetch() unavailable – install node-fetch or upgrade to Node 18+`
    );
    return null;
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return null;
  }

  const trimmedName = name.trim();
  const trimmedHint =
    typeof locationHint === "string" && locationHint.trim()
      ? locationHint.trim()
      : "";

  const query = [trimmedName, trimmedHint].filter(Boolean).join(" ");

  // Cache lookup. Hits skip the (billable) Google call entirely. A
  // negative-cached entry (payload === null) means we previously asked
  // and Google returned nothing for the same key — don't re-bill.
  const cacheArgs = { name: trimmedName, locationHint: trimmedHint };
  const cached = await gpCache.getCached("lookupBusiness", cacheArgs);
  if (cached.hit) {
    log.info(`${TAG} cache hit`, {
      query,
      negative: cached.payload === null,
    });
    return cached.payload;
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/textsearch/json"
  );
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);

  log.info(`${TAG} lookupBusiness`, { query, companyNumber });

  // Helper: any code path that decides "no usable result" should still
  // negative-cache so the next caller doesn't re-bill us for the same
  // miss. HTTP/network errors are NOT cached — we want to retry those.
  const negativeCache = async () => {
    await gpCache.setCached("lookupBusiness", cacheArgs, null);
    return null;
  };

  try {
    const res = await fetchFn(url.toString());
    if (!res.ok) {
      log.warn(`${TAG} HTTP error from Google Places`, {
        status: res.status,
        query,
      });
      // Transient HTTP failure — don't poison the cache with a negative
      // entry; let the next caller retry.
      return null;
    }

    const data = await res.json();

    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      log.warn(`${TAG} Google Places status`, {
        status: data.status,
        query,
        message: data.error_message || null,
      });
    }

    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) return await negativeCache();

    const best = results[0];
    if (!best || !best.place_id) return await negativeCache();

    const googleName = typeof best.name === "string" ? best.name.trim() : "";

    // Reject if names do not roughly match
    if (!namesRoughlyMatch(googleName, trimmedName)) {
      log.warn(`${TAG} rejecting Google result due to mismatch`, {
        query: trimmedName,
        googleName,
        placeId: best.place_id,
      });
      return await negativeCache();
    }

    const out = {
      placeId: best.place_id,
      rating: typeof best.rating === "number" ? best.rating : undefined,
      userRatingsTotal:
        typeof best.user_ratings_total === "number"
          ? best.user_ratings_total
          : undefined,
      name: best.name,
      address: best.formatted_address,
    };

    log.info(`${TAG} accepted Google place`, {
      placeId: out.placeId,
      rating: out.rating,
      reviews: out.userRatingsTotal,
      googleName,
      query,
    });

    await gpCache.setCached("lookupBusiness", cacheArgs, out);
    return out;
  } catch (e) {
    log.warn(`${TAG} Google Places lookup failed`, {
      query,
      error: e?.message || e,
    });
    return null;
  }
}

async function getPlaceDetails(placeId, fields = ["website"]) {
  if (isExternalServicesMocked()) {
    return syntheticPlaceDetails({ placeId, fields });
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !placeId) return null;

  if (!fetchFn) {
    log.warn(`${TAG} fetch() unavailable`);
    return null;
  }

  // Cache key includes fields — different field sets are different SKUs
  // and may return different shapes, so we don't want to share entries.
  const cacheArgs = { placeId, fields: [...fields].sort() };
  const cached = await gpCache.getCached("getPlaceDetails", cacheArgs);
  if (cached.hit) {
    log.info(`${TAG} details cache hit`, {
      placeId,
      negative: cached.payload === null,
    });
    return cached.payload;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetchFn(url.toString());
    if (!res.ok) {
      log.warn(`${TAG} Place Details HTTP error`, { status: res.status, placeId });
      // Transient HTTP failure — leave the cache alone.
      return null;
    }

    const data = await res.json();
    if (data.status !== "OK") {
      log.warn(`${TAG} Place Details status`, { status: data.status, placeId });
      // Definitive "no" from Google → negative-cache.
      await gpCache.setCached("getPlaceDetails", cacheArgs, null);
      return null;
    }

    const result = data.result || null;
    await gpCache.setCached("getPlaceDetails", cacheArgs, result);
    return result;
  } catch (e) {
    log.warn(`${TAG} Place Details failed`, { placeId, error: e?.message });
    return null;
  }
}

module.exports = {
  lookupBusiness,
  getPlaceDetails,
};
