// server/lib/googlePlacesCache.js
//
// Persistent cache for Google Places API responses. Lives in MySQL so it
// survives process restarts and is shared across our 4 e2e shards / any
// future horizontally-scaled prod tier.
//
// Why this exists:
//   Google bills Places by SKU on EVERY call:
//     - Text Search          ~£0.025
//     - Atmosphere Data      ~£0.005   (charged when the response includes
//                                       rating / user_ratings_total — which
//                                       textsearch always returns)
//     - Contact Data         ~£0.0024  (when fields=website/phone)
//   A single PUT /api/tradesmen/me triggers ALL THREE on the same call.
//   In production most saves are repeats of the same `(name, postcode)`
//   pair (a tradesperson editing their profile, an admin re-enriching),
//   so caching trims the bill substantially with no real freshness cost
//   — listings change rarely.
//
// Design notes:
//   - Key = sha256 of canonicalised input (operation + sorted args). We
//     don't store the raw input (PII-light, but no need to keep it).
//   - Negative cache: when Google returns no result, we still write a
//     row with payload=NULL so the next caller doesn't re-bill us for
//     the same miss. Negative TTL is shorter than positive TTL on the
//     theory that a brand-new business may get listed soon.
//   - TTLs configurable via env so we can tune from prod without a
//     deploy if we see staleness complaints.

const crypto = require("crypto");
const { query } = require("./mysql");
const { logger } = require("./logger");

const TAG = "[gp-cache]";

// 30 days for a real hit, 7 days for a "Google said no". Override per
// environment if needed. Numbers in seconds — DATETIME diff is awkward
// so we compute the cutoff as `NOW() - INTERVAL ? SECOND` parameterised.
const TTL_HIT_S = Number(process.env.GP_CACHE_TTL_HIT_S || 30 * 24 * 3600);
const TTL_MISS_S = Number(process.env.GP_CACHE_TTL_MISS_S || 7 * 24 * 3600);

function canonicalise(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(canonicalise).join("|");
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return keys.map((k) => `${k}=${canonicalise(value[k])}`).join("&");
  }
  return String(value).trim().toLowerCase();
}

function makeKey(operation, args) {
  const raw = `${operation}::${canonicalise(args)}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Look up a cached entry. Returns:
 *   { hit: true,  payload: <json | null> }   // cached HIT or negative HIT
 *   { hit: false }                            // not cached / expired
 *
 * Callers distinguish positive vs negative by inspecting `payload`:
 * a positive cache entry returns the original Google object, a negative
 * cache entry returns `null` — either way the caller skips the API call.
 */
async function getCached(operation, args) {
  const key = makeKey(operation, args);

  try {
    const rows = await query(
      `
      SELECT payload, fetched_at
        FROM google_places_cache
       WHERE cache_key = ?
       LIMIT 1
      `,
      [key],
    );
    const row = rows && rows[0];
    if (!row) return { hit: false };

    const ageMs = Date.now() - new Date(row.fetched_at).getTime();
    const ageS = ageMs / 1000;
    const isNegative = row.payload == null;
    const ttl = isNegative ? TTL_MISS_S : TTL_HIT_S;
    if (ageS > ttl) return { hit: false };

    // mysql2 returns JSON columns as objects already.
    return { hit: true, payload: row.payload ?? null };
  } catch (e) {
    // Cache failures must never break the actual feature. Treat as miss.
    logger.warn({ err: e?.message || e }, `${TAG} read failed`);
    return { hit: false };
  }
}

/**
 * Persist a result. Pass `payload = null` to negatively cache a miss.
 * Upserts on cache_key so a refresh just rewrites the row.
 */
async function setCached(operation, args, payload) {
  const key = makeKey(operation, args);
  try {
    await query(
      `
      INSERT INTO google_places_cache (cache_key, payload, fetched_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        payload    = VALUES(payload),
        fetched_at = NOW()
      `,
      [key, payload === null ? null : JSON.stringify(payload)],
    );
  } catch (e) {
    logger.warn({ err: e?.message || e }, `${TAG} write failed`);
  }
}

module.exports = { getCached, setCached };
