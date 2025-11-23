// server/lib/googlePlaces.js
//
// Helper used by recommendations/verification.get.js
// to look up a business in Google Places by name (+ optional location hint).
//
// It calls the Places Text Search API:
//   https://maps.googleapis.com/maps/api/place/textsearch/json
//
// Required env:
//   GOOGLE_PLACES_API_KEY=<your real key>
//
// Returns (on success):
//   {
//     placeId: string,
//     rating: number | undefined,
//     userRatingsTotal: number | undefined,
//     name: string | undefined,
//     address: string | undefined
//   }
// or `null` if nothing useful is found.
//

const TAG = "[googlePlaces]";

// Try to use global fetch (Node 18+), fall back to node-fetch if available
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fetchFn = require("node-fetch");
  } catch (e) {
    // We'll handle missing fetch later
  }
}

async function lookupBusiness({ name, locationHint, companyNumber }) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn(
      `${TAG} GOOGLE_PLACES_API_KEY is not set – skipping Google lookup`
    );
    return null;
  }

  if (!fetchFn) {
    console.warn(
      `${TAG} no fetch implementation available – install node-fetch or use Node 18+`
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

  console.log(
    `${TAG} lookupBusiness query="${query}" company=${companyNumber}`
  );

  try {
    const res = await fetchFn(url.toString());
    if (!res.ok) {
      console.warn(
        `${TAG} HTTP ${res.status} from Google Places for query="${query}"`
      );
      return null;
    }

    const data = await res.json();

    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(
        `${TAG} Google Places status=${
          data.status
        } for query="${query}" message=${data.error_message || "-"}`
      );
    }

    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
      return null;
    }

    // For now, just take the first result. You can add smarter matching later.
    const best = results[0];

    if (!best || !best.place_id) {
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

    console.log(
      `${TAG} matched placeId=${out.placeId} rating=${
        out.rating ?? "-"
      } reviews=${out.userRatingsTotal ?? "-"} for query="${query}"`
    );

    return out;
  } catch (e) {
    console.warn(
      `${TAG} error calling Google Places for query="${query}":`,
      e && e.message ? e.message : e
    );
    return null;
  }
}

module.exports = {
  lookupBusiness,
};
