// server/lib/postcodesIo.js
//
// Tiny server-side wrapper around postcodes.io with in-process caching.
// Used by the pilot-area gate to resolve a postcode (or outward) to its
// admin_district(s) so we can check against the enabled borough set
// without maintaining a static outward → borough map locally.
//
// postcodes.io is a free public service (no auth, generous limits). The
// cache is best-effort; if a lookup fails we return null and the caller
// decides whether to fail-open or fail-closed.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fetch = global.fetch || require("node-fetch");

const OUTCODE_TTL_MS = 24 * 60 * 60 * 1000; // 24h - outward → districts is very stable
const POSTCODE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 1000; // failures: retry sooner

const outcodeCache = new Map(); // outward (UPPER) → { districts: string[], expiresAt }
const postcodeCache = new Map(); // postcode (UPPER, no spaces) → { district: string, expiresAt }

function now() {
  return Date.now();
}

/**
 * Resolve an outward postcode (e.g. "E4") to the list of admin districts
 * that contain it. Postcodes.io's /outcodes endpoint returns an array
 * because some outwards span multiple districts (e.g. SE9 covers parts
 * of Greenwich AND Bromley).
 *
 * Returns: string[] of district names, or [] when the lookup fails.
 */
async function resolveOutwardDistricts(outward) {
  const key = String(outward || "").toUpperCase().trim();
  if (!key) return [];

  const cached = outcodeCache.get(key);
  if (cached && cached.expiresAt > now()) return cached.districts;

  try {
    const r = await fetch(
      `https://api.postcodes.io/outcodes/${encodeURIComponent(key)}`,
    );
    if (!r.ok) {
      outcodeCache.set(key, { districts: [], expiresAt: now() + NEGATIVE_TTL_MS });
      return [];
    }
    const data = await r.json();
    const districts = Array.isArray(data?.result?.admin_district)
      ? data.result.admin_district.filter(Boolean)
      : [];
    outcodeCache.set(key, { districts, expiresAt: now() + OUTCODE_TTL_MS });
    return districts;
  } catch {
    outcodeCache.set(key, { districts: [], expiresAt: now() + NEGATIVE_TTL_MS });
    return [];
  }
}

/**
 * Resolve a full UK postcode (e.g. "E4 7ER") to its admin_district. Used
 * when we have the full postcode (more precise than outward only).
 *
 * Returns: string district name, or null when the lookup fails.
 */
async function resolvePostcodeDistrict(postcode) {
  const key = String(postcode || "").toUpperCase().replace(/\s+/g, "").trim();
  if (!key) return null;

  const cached = postcodeCache.get(key);
  if (cached && cached.expiresAt > now()) return cached.district;

  try {
    const r = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(key)}`,
    );
    if (!r.ok) {
      postcodeCache.set(key, { district: null, expiresAt: now() + NEGATIVE_TTL_MS });
      return null;
    }
    const data = await r.json();
    const district = data?.result?.admin_district || null;
    postcodeCache.set(key, { district, expiresAt: now() + POSTCODE_TTL_MS });
    return district;
  } catch {
    postcodeCache.set(key, { district: null, expiresAt: now() + NEGATIVE_TTL_MS });
    return null;
  }
}

function clearPostcodesIoCache() {
  outcodeCache.clear();
  postcodeCache.clear();
}

module.exports = {
  resolveOutwardDistricts,
  resolvePostcodeDistrict,
  clearPostcodesIoCache,
};
