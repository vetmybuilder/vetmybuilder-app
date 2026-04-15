// server/lib/mocks/syntheticExternal.js
//
// Deterministic synthetic responses for paid external services in test /
// dev mode. Returned in place of nulls when MOCK_EXTERNAL_SERVICES=1, so
// the UI shows realistic ratings/verification badges instead of blank
// "no data" states — but no billable call leaves the box.
//
// Why deterministic-by-name (not random):
//   - E2E tests can assert on stable values per company name.
//   - Devs running `dev:manual` get the same rating every time they
//     restart the server, so screenshots stay reproducible.
//
// Each value derives from a sha256 of the company name, mapped into a
// plausible range. Easy to spot in production logs (place IDs all start
// "MOCK_") so a stray prod call would be obvious.

const crypto = require("crypto");

function nameHash(name) {
  return crypto
    .createHash("sha256")
    .update(String(name || "").toLowerCase().trim())
    .digest();
}

// Pick an int in [min, max] from the hash bytes — deterministic per name.
function pickInt(buf, offset, min, max) {
  const span = max - min + 1;
  return min + (buf.readUInt32BE(offset % (buf.length - 4)) % span);
}

// ------------------------------------------------------------------
// Google Places mock — shape matches what lookupBusiness returns.
// ------------------------------------------------------------------
function syntheticGooglePlace({ name }) {
  if (!name) return null;
  // Escape hatch: names containing the marker NoGoogle return null —
  // useful for tests that need to assert the "no rating chip" path.
  if (/nogoogle|no-google/i.test(name)) return null;
  const buf = nameHash(name);
  // Rating in [3.8, 4.9] (one decimal). Most builders cluster high.
  const ratingTenths = pickInt(buf, 0, 38, 49);
  const rating = ratingTenths / 10;
  const userRatingsTotal = pickInt(buf, 4, 6, 240);
  // Place ID prefix MOCK_ so a leak in prod logs would be unmistakable.
  const placeId = `MOCK_${buf.slice(0, 12).toString("hex")}`;
  return {
    placeId,
    rating,
    userRatingsTotal,
    name,
    address: "1 Mock Street, London E4 0BQ",
  };
}

// ------------------------------------------------------------------
// Google Place Details mock — keyed by placeId + fields requested.
// ------------------------------------------------------------------
function syntheticPlaceDetails({ placeId, fields = [] }) {
  if (!placeId) return null;
  const buf = nameHash(placeId);
  const out = { place_id: placeId };
  if (fields.includes("website")) {
    out.website = `https://example-mock-${buf.slice(0, 4).toString("hex")}.test`;
  }
  if (fields.includes("formatted_phone_number")) {
    out.formatted_phone_number = "020 7946 0000";
  }
  if (fields.includes("rating")) {
    out.rating = pickInt(buf, 0, 38, 49) / 10;
  }
  if (fields.includes("user_ratings_total")) {
    out.user_ratings_total = pickInt(buf, 4, 6, 240);
  }
  return out;
}

// ------------------------------------------------------------------
// Companies House mock — shape matches matchByName() return value.
// We always return verdict="verified" so the UI shows the green badge;
// tests that need negative cases can use names containing "NoCH".
// ------------------------------------------------------------------
function syntheticCompaniesHouseMatch({ name }) {
  if (!name) {
    return { verdict: "no_match", best: null, candidates: [] };
  }
  // Honour escape hatch: names containing the marker NoCH skip the mock,
  // useful for tests that need to assert the "no match" path.
  if (/nocompanieshouse|noch|no-ch/i.test(name)) {
    return { verdict: "no_match", best: null, candidates: [] };
  }

  const buf = nameHash(name);
  // 8-digit company number. Real CH numbers are 8 chars (often with
  // leading zeros for older records). Prefix "MK" is non-numeric so it
  // can never collide with a real CH number, AND would be rejected as
  // invalid by any external CH consumer — unmistakable in prod logs.
  const companyNumber = `MK${buf.slice(0, 3).toString("hex").toUpperCase()}`;
  const best = {
    score: 95,
    number: companyNumber,
    name: name.trim(),
    status: "active",
    dateOfCreation: "2015-01-01",
    sicCodes: ["43390"], // "Other building completion and finishing"
    address: {
      address_line_1: "1 Mock Street",
      locality: "London",
      postal_code: "E4 0BQ",
      country: "United Kingdom",
    },
  };

  return {
    verdict: "verified",
    best,
    candidates: [best],
  };
}

module.exports = {
  syntheticGooglePlace,
  syntheticPlaceDetails,
  syntheticCompaniesHouseMatch,
};
