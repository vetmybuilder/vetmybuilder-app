// server/lib/pilotProjectTypes.js
//
// Pilot launch project-type management. Mirrors server/lib/pilotAreas.js
// but gates project categories/leaves instead of boroughs. Admin toggles
// which leaves are accepted by the new-project flow.
//
// Granularity: stored at LEAF level (e.g. "Bathroom Remodel (Full)"), with
// a `category` column for the parent. A category is "live" in the
// homeowner UI when at least one of its leaves is enabled. Admin can
// bulk-toggle a whole category, or flip individual leaves.
//
// Canonical leaf list comes from server/lib/matching/projectTradeMap.js's
// TYPE_TO_CATEGORY map (which mirrors web/types/projectTypes.ts). On first
// read we self-bootstrap the pilot_project_types table from that catalog,
// enabling the 11 launch categories and disabling the rest.
//
// Reads are cached in-process for a short window so we don't hammer MySQL
// per request. Invalidated on PATCH and after CACHE_TTL_MS.

const { TYPE_TO_CATEGORY } = require("./matching/projectTradeMap");

// Categories live at launch in Waltham Forest. All other categories show
// as "Coming soon" in admin + homeowner UI until flipped on. Mix of:
// - big-ticket renovation (Bathroom, Extensions, Building, Insulation)
// - trade specialists doubling as sub-trades on the big jobs (Plumbing,
//   Electrical, Painting & Decorating, Tiling & Plastering)
// - low-ticket entry point (Cleaning & Waste)
// - catch-all (Repairs & Maintenance)
// - Windows & Doors (replacement / secondary glazing demand)
const DEFAULT_ENABLED_CATEGORIES = new Set([
  "Bathroom",
  "Extensions & Conversions",
  "Building & Construction",
  "Insulation",
  "Cleaning & Waste",
  "Painting & Decorating",
  "Plumbing",
  "Electrical",
  "Windows & Doors",
  "Tiling & Plastering",
  "Repairs & Maintenance",
]);

const CACHE_TTL_MS = 30_000;

let enabledTypesCache = null;
let enabledTypesCacheExpiresAt = 0;
let seedingPromise = null;

function invalidateCache() {
  enabledTypesCache = null;
  enabledTypesCacheExpiresAt = 0;
}

async function ensureSeeded(mysqlQuery) {
  if (seedingPromise) return seedingPromise;
  seedingPromise = (async () => {
    // Self-bootstrap: create the table if missing so an existing install
    // picks up the feature without manual SQL/migrations.
    await mysqlQuery(
      `CREATE TABLE IF NOT EXISTS pilot_project_types (
         type_name VARCHAR(200) NOT NULL PRIMARY KEY,
         category VARCHAR(100) NOT NULL,
         enabled TINYINT(1) NOT NULL DEFAULT 0,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         KEY idx_pilot_project_types_category (category)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    // Reconcile against the canonical catalog. New leaves get inserted
    // with their category's default flag; existing rows are left alone so
    // admin toggles persist across deploys.
    for (const [typeName, category] of Object.entries(TYPE_TO_CATEGORY)) {
      await mysqlQuery(
        "INSERT IGNORE INTO pilot_project_types (type_name, category, enabled) VALUES (?, ?, ?)",
        [typeName, category, DEFAULT_ENABLED_CATEGORIES.has(category) ? 1 : 0],
      );
    }
  })().finally(() => {
    seedingPromise = null;
  });
  return seedingPromise;
}

/**
 * Every leaf with its category and enabled flag.
 * Shape: [{ typeName, category, enabled }]
 */
async function listProjectTypes(mysqlQuery) {
  await ensureSeeded(mysqlQuery);
  const rows = await mysqlQuery(
    "SELECT type_name, category, enabled FROM pilot_project_types ORDER BY category, type_name",
  );
  return rows.map((r) => ({
    typeName: r.type_name,
    category: r.category,
    enabled: !!Number(r.enabled),
  }));
}

/**
 * Just the enabled leaves. Cached.
 */
async function getEnabledProjectTypes(mysqlQuery) {
  if (enabledTypesCache && Date.now() < enabledTypesCacheExpiresAt) {
    return enabledTypesCache;
  }
  const all = await listProjectTypes(mysqlQuery);
  const enabled = all.filter((t) => t.enabled);
  enabledTypesCache = enabled;
  enabledTypesCacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return enabled;
}

/**
 * Set of enabled leaf names for O(1) gate membership tests. The
 * server-side pilot gate calls this and checks the posted `type` against
 * it.
 */
async function getEnabledTypeNameSet(mysqlQuery) {
  const enabled = await getEnabledProjectTypes(mysqlQuery);
  return new Set(enabled.map((t) => t.typeName));
}

/**
 * Set of categories that have AT LEAST ONE enabled leaf. Used by the
 * homeowner picker to grey-out whole-category cards with "Coming soon".
 */
async function getEnabledCategoryNameSet(mysqlQuery) {
  const enabled = await getEnabledProjectTypes(mysqlQuery);
  return new Set(enabled.map((t) => t.category));
}

/**
 * Toggle a single leaf's enabled flag. Throws when the leaf name isn't in
 * the canonical catalog.
 */
async function setTypeEnabled(mysqlQuery, typeName, enabled) {
  if (!Object.prototype.hasOwnProperty.call(TYPE_TO_CATEGORY, typeName)) {
    const err = new Error("unknown_project_type");
    err.code = "unknown_project_type";
    throw err;
  }
  await ensureSeeded(mysqlQuery);
  await mysqlQuery(
    "UPDATE pilot_project_types SET enabled = ? WHERE type_name = ?",
    [enabled ? 1 : 0, typeName],
  );
  invalidateCache();
}

/**
 * Bulk-toggle every leaf inside a category. Throws when the category
 * doesn't appear in the canonical catalog.
 */
async function setCategoryEnabled(mysqlQuery, category, enabled) {
  const known = new Set(Object.values(TYPE_TO_CATEGORY));
  if (!known.has(category)) {
    const err = new Error("unknown_category");
    err.code = "unknown_category";
    throw err;
  }
  await ensureSeeded(mysqlQuery);
  await mysqlQuery(
    "UPDATE pilot_project_types SET enabled = ? WHERE category = ?",
    [enabled ? 1 : 0, category],
  );
  invalidateCache();
}

module.exports = {
  DEFAULT_ENABLED_CATEGORIES,
  listProjectTypes,
  getEnabledProjectTypes,
  getEnabledTypeNameSet,
  getEnabledCategoryNameSet,
  setTypeEnabled,
  setCategoryEnabled,
  invalidateCache,
};
