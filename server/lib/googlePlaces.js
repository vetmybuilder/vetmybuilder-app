// server/lib/googlePlaces.js
//
// Helper used by recommendations/verification.get.js
// to look up a business in Google Places by name (+ optional location hint).

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

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/textsearch/json"
  );
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);

  log.info(`${TAG} lookupBusiness`, { query, companyNumber });

  try {
    const res = await fetchFn(url.toString());
    if (!res.ok) {
      log.warn(`${TAG} HTTP error from Google Places`, {
        status: res.status,
        query,
      });
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
    if (!results.length) return null;

    const best = results[0];
    if (!best || !best.place_id) return null;

    const googleName = typeof best.name === "string" ? best.name.trim() : "";

    // Reject if names do not roughly match
    if (!namesRoughlyMatch(googleName, trimmedName)) {
      log.warn(`${TAG} rejecting Google result due to mismatch`, {
        query: trimmedName,
        googleName,
        placeId: best.place_id,
      });
      return null;
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

    return out;
  } catch (e) {
    log.warn(`${TAG} Google Places lookup failed`, {
      query,
      error: e?.message || e,
    });
    return null;
  }
}

module.exports = {
  lookupBusiness,
};
