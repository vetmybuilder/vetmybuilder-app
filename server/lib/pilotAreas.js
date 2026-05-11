// server/lib/pilotAreas.js
//
// Pilot launch area management. Boroughs are toggled in admin to control
// which postcodes are accepted by the new-project flow. Borough name is
// the primary key.
//
// Source of truth for "which borough does this postcode belong to" is
// postcodes.io (`admin_district`), NOT a hand-maintained outward map.
// The pilot catalog here is just the canonical list of borough NAMES we
// surface in admin so an operator has a finite list of toggles. Storing
// outward codes locally is no longer needed - the LocationField pulls the
// admin_district when the user picks a postcode, the server gate verifies
// against postcodes.io at POST time.
//
// On first read we seed the pilot_boroughs table from this list with
// Waltham Forest enabled and the rest disabled. Subsequent reads return
// whatever the admin has set.
//
// Reads are cached in-process for a short window so we don't hammer MySQL
// per request. Invalidated on PATCH and after CACHE_TTL_MS.

// (no BOROUGH_POSTCODES import needed - source of truth for borough lookup
// is postcodes.io's admin_district. Pipeline + recommendations features
// still use the static map directly from boroughPostcodes.js.)

// Canonical list of London admin districts that postcodes.io returns for
// the GLA area, plus a couple of bordering Essex districts that overlap
// with the early launch area. Names match postcodes.io's `admin_district`
// values exactly (case-sensitive) so the gate can do a straight set
// membership check.
const LONDON_BOROUGHS = [
  "Barking and Dagenham",
  "Barnet",
  "Bexley",
  "Brent",
  "Bromley",
  "Camden",
  "City of London",
  "Croydon",
  "Ealing",
  "Enfield",
  "Epping Forest",
  "Greenwich",
  "Hackney",
  "Hammersmith and Fulham",
  "Haringey",
  "Harrow",
  "Havering",
  "Hillingdon",
  "Hounslow",
  "Islington",
  "Kensington and Chelsea",
  "Kingston upon Thames",
  "Lambeth",
  "Lewisham",
  "Merton",
  "Newham",
  "Redbridge",
  "Richmond upon Thames",
  "Southwark",
  "Sutton",
  "Tower Hamlets",
  "Waltham Forest",
  "Wandsworth",
  "Westminster",
];

const DEFAULT_ENABLED = new Set(["Waltham Forest"]);
const CACHE_TTL_MS = 30_000;

let cache = null;
let cacheExpiresAt = 0;
let seedingPromise = null;

function invalidateCache() {
  cache = null;
  cacheExpiresAt = 0;
}

async function ensureSeeded(mysqlQuery) {
  if (seedingPromise) return seedingPromise;
  seedingPromise = (async () => {
    // Self-bootstrapping: create the table if it doesn't exist yet.
    // Means an existing install picks up the pilot-areas feature without
    // any manual SQL or migration step - just deploy the new code and
    // the next request creates and seeds the table.
    await mysqlQuery(
      `CREATE TABLE IF NOT EXISTS pilot_boroughs (
         name VARCHAR(100) NOT NULL PRIMARY KEY,
         enabled TINYINT(1) NOT NULL DEFAULT 0,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    // Reconcile against the canonical catalog. Any borough name missing
    // from the table gets inserted with its default flag. Existing rows
    // are left alone (INSERT IGNORE) so admin toggles persist when the
    // catalog grows.
    for (const name of LONDON_BOROUGHS) {
      await mysqlQuery(
        "INSERT IGNORE INTO pilot_boroughs (name, enabled) VALUES (?, ?)",
        [name, DEFAULT_ENABLED.has(name) ? 1 : 0],
      );
    }
  })().finally(() => {
    seedingPromise = null;
  });
  return seedingPromise;
}

/**
 * Returns every borough with its enabled flag.
 * Shape: [{ name, enabled }]
 */
async function listBoroughs(mysqlQuery) {
  await ensureSeeded(mysqlQuery);
  const rows = await mysqlQuery(
    "SELECT name, enabled FROM pilot_boroughs ORDER BY name",
  );
  return rows.map((r) => ({
    name: r.name,
    enabled: !!Number(r.enabled),
  }));
}

/**
 * Returns just the enabled boroughs (used by the public /api/pilot/areas
 * endpoint and the LocationField pilot block).
 */
async function getEnabledBoroughs(mysqlQuery) {
  if (cache && Date.now() < cacheExpiresAt) return cache;
  const all = await listBoroughs(mysqlQuery);
  const enabled = all.filter((b) => b.enabled);
  cache = enabled;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return enabled;
}

/**
 * Returns the set of enabled borough names (uppercase normalised) for
 * O(1) membership tests. The server-side pilot gate calls postcodes.io
 * to resolve a postcode to its admin_district(s), then checks those
 * names against this set.
 */
async function getEnabledBoroughNameSet(mysqlQuery) {
  const boroughs = await getEnabledBoroughs(mysqlQuery);
  return new Set(boroughs.map((b) => b.name));
}

/**
 * Toggle a borough's enabled flag. Throws when the borough name isn't in
 * the canonical catalog (callers should validate against listBoroughs first).
 */
async function setBoroughEnabled(mysqlQuery, name, enabled) {
  if (!LONDON_BOROUGHS.includes(name)) {
    const err = new Error("unknown_borough");
    err.code = "unknown_borough";
    throw err;
  }
  await ensureSeeded(mysqlQuery);
  await mysqlQuery(
    "UPDATE pilot_boroughs SET enabled = ? WHERE name = ?",
    [enabled ? 1 : 0, name],
  );
  invalidateCache();
}

module.exports = {
  LONDON_BOROUGHS,
  listBoroughs,
  getEnabledBoroughs,
  getEnabledBoroughNameSet,
  setBoroughEnabled,
  invalidateCache,
};
