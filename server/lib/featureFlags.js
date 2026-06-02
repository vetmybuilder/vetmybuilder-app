// server/lib/featureFlags.js
//
// Central feature-flag system. Flag DEFINITIONS (key, label, description,
// default) live here in code; the `feature_flags` DB table stores on/off
// overrides per environment (each env has its own DB). New flags added
// here appear automatically with their default until an admin toggles them.
//
// Reads are cached in-memory for a short TTL so we don't hit the DB on
// every request. Toggling a flag clears the cache so the change is live
// within the TTL window at worst, immediately on the toggling node.

const FLAG_DEFINITIONS = [
  {
    key: "payments",
    label: "Payments",
    description: "Pass, subscription, and contact-unlock checkout (Stripe) and all pay UI.",
    default: false,
  },
  {
    key: "homeowner_signup",
    label: "Homeowner signup",
    description: "Allow homeowners to register (email and Google). When off, homeowner signup is closed.",
    default: false,
  },
  {
    key: "beta_code_homeowner",
    label: "Beta code required - homeowners",
    description:
      "When on, homeowner signup (email and Google) requires a beta access code. Code value is read from the BETA_CODE env var. Default off.",
    default: false,
  },
  {
    key: "beta_code_trader",
    label: "Beta code required - tradespeople",
    description:
      "When on, tradesperson signup (email and Google) requires a beta access code. Code value is read from the BETA_CODE env var. Default off.",
    default: false,
  },
  {
    key: "share_nextdoor",
    label: "Nextdoor share button",
    description:
      "Show the Nextdoor tile in the owner 'Invite your community' card. Independent of the Facebook tile. WhatsApp/Email/SMS/Copy are always shown. Default off.",
    default: false,
  },
  {
    key: "share_facebook",
    label: "Facebook share button",
    description:
      "Show the Facebook tile in the owner 'Invite your community' card. Independent of the Nextdoor tile. WhatsApp/Email/SMS/Copy are always shown. Default off.",
    default: false,
  },
];

// Short TTL so admin toggles take effect almost immediately on refresh. The
// toggling node clears its own cache on write (instant on single-process prod);
// this small TTL also bounds staleness on any other process (e.g. the local
// dev multi-shard stack) to ~2s. The cache still shields the public
// /api/feature-flags endpoint from a DB read on every request.
const CACHE_TTL_MS = 2_000;
let cache = null;
let cacheAt = 0;

// Per-flag environment overrides, honored ONLY in the e2e test context
// (TEST_ENV=e2e). Production never reads these - prod is controlled by the
// admin toggle / DB. e2e CI has no admin UI and no seeded feature_flags
// rows, so without an escape hatch the signup + payment suites (which need
// these features ON) would be blocked. Set in docker-compose.e2e.ci.yml.
// Local `dev:manual` also runs with TEST_ENV=e2e but does not set these
// vars, so the admin toggle keeps working there.
const ENV_OVERRIDE_VARS = {
  payments: "FEATURE_PAYMENTS",
  homeowner_signup: "FEATURE_HOMEOWNER_SIGNUP",
  beta_code_homeowner: "FEATURE_BETA_CODE_HOMEOWNER",
  beta_code_trader: "FEATURE_BETA_CODE_TRADER",
};

function readEnvOverride(key) {
  if (process.env.TEST_ENV !== "e2e") return undefined;
  const name = ENV_OVERRIDE_VARS[key];
  const raw = name ? process.env[name] : undefined;
  if (raw == null || raw === "") return undefined;
  return /^(1|true|on|yes)$/i.test(String(raw).trim());
}

function defaults() {
  const out = {};
  for (const def of FLAG_DEFINITIONS) out[def.key] = def.default;
  return out;
}

/** Load the full flag map (code defaults merged with DB overrides), cached. */
async function loadFlags(mysqlQuery) {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;

  const flags = defaults();
  try {
    const rows = await mysqlQuery("SELECT flag_key, enabled FROM feature_flags");
    for (const r of rows || []) {
      if (Object.prototype.hasOwnProperty.call(flags, r.flag_key)) {
        flags[r.flag_key] = Number(r.enabled) === 1;
      }
    }
  } catch {
    // Table missing / DB hiccup - fall back to code defaults (fail safe:
    // payments + homeowner_signup default OFF).
  }

  // e2e-only env overrides win over both DB and defaults (no-op in prod).
  for (const def of FLAG_DEFINITIONS) {
    const ov = readEnvOverride(def.key);
    if (ov !== undefined) flags[def.key] = ov;
  }

  cache = flags;
  cacheAt = now;
  return flags;
}

/** True if a single flag is enabled. */
async function isFlagEnabled(mysqlQuery, key) {
  const flags = await loadFlags(mysqlQuery);
  return !!flags[key];
}

/** Drop the cache so the next read reflects a just-written change. */
function clearFlagCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = {
  FLAG_DEFINITIONS,
  loadFlags,
  isFlagEnabled,
  clearFlagCache,
};
