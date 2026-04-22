// server/lib/pricingLookup.js
//
// Hybrid pricing: lookup table first, LLM fallback, auto-populate.
//
// Flow:
//   1. Normalise the job subtype
//   2. Check pricing_lookup table
//   3. If found -> return cached estimate
//   4. If not found -> parse from LLM classification result -> write to table -> return
//
// Admin can review and override any entry via the admin API.

const { logger } = require("./logger");

function extractOutward(location) {
  if (!location) return "";
  const match = String(location).trim().toUpperCase().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
  return match ? match[1] : "";
}

function normaliseSubtype(subtype) {
  return String(subtype || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parsePriceBand(priceBandStr) {
  if (!priceBandStr || typeof priceBandStr !== "string") return null;
  const numbers = priceBandStr.match(/[\d,]+/g);
  if (!numbers || numbers.length < 2) return null;
  const min = parseInt(numbers[0].replace(/,/g, ""), 10);
  const max = parseInt(numbers[1].replace(/,/g, ""), 10);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min: min * 100, max: max * 100 }; // convert pounds to pence
}

function formatPriceBand(minPence, maxPence) {
  const minPounds = Math.round(minPence / 100);
  const maxPounds = Math.round(maxPence / 100);
  const fmt = (n) => n >= 1000 ? n.toLocaleString("en-GB") : String(n);
  return `\u00a3${fmt(minPounds)}-\u00a3${fmt(maxPounds)}`;
}

async function getPriceBand({ mysqlQuery, subtype, location, classificationPriceBand }) {
  const log = logger.child({ module: "pricingLookup" });
  const norm = normaliseSubtype(subtype);
  if (!norm) return classificationPriceBand || null;
  const loc = extractOutward(location);

  // 1. Check lookup table — try location-specific first, then generic
  try {
    let rows = [];
    if (loc) {
      rows = await mysqlQuery(
        "SELECT min_pence, max_pence FROM pricing_lookup WHERE subtype_normalised = ? AND location = ? LIMIT 1",
        [norm, loc]
      );
    }
    if (rows.length === 0) {
      rows = await mysqlQuery(
        "SELECT min_pence, max_pence FROM pricing_lookup WHERE subtype_normalised = ? AND location = '' LIMIT 1",
        [norm]
      );
    }
    if (rows.length > 0) {
      return formatPriceBand(rows[0].min_pence, rows[0].max_pence);
    }
  } catch (err) {
    log.warn?.({ err: err?.message }, "pricing lookup query failed");
  }

  // 2. Not found — parse from classification and store (location-specific)
  if (classificationPriceBand) {
    const parsed = parsePriceBand(classificationPriceBand);
    if (parsed) {
      try {
        await mysqlQuery(
          `INSERT INTO pricing_lookup (subtype, subtype_normalised, location, min_pence, max_pence, source, created_at)
           VALUES (?, ?, ?, ?, ?, 'ai', NOW())
           ON DUPLICATE KEY UPDATE min_pence = VALUES(min_pence), max_pence = VALUES(max_pence), updated_at = NOW()`,
          [subtype, norm, loc, parsed.min, parsed.max]
        );
        log.info?.({ subtype, norm, location: loc, min: parsed.min, max: parsed.max }, "pricing cached from AI");
      } catch (err) {
        log.warn?.({ err: err?.message }, "pricing insert failed");
      }
    }
  }

  return classificationPriceBand || null;
}

async function setPriceBand({ mysqlQuery, subtype, location, minPence, maxPence, source }) {
  const norm = normaliseSubtype(subtype);
  const loc = extractOutward(location) || "";
  await mysqlQuery(
    `INSERT INTO pricing_lookup (subtype, subtype_normalised, location, min_pence, max_pence, source, reviewed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
     ON DUPLICATE KEY UPDATE min_pence = VALUES(min_pence), max_pence = VALUES(max_pence), source = VALUES(source), reviewed = 1, updated_at = NOW()`,
    [subtype, norm, loc, minPence, maxPence, source || "manual"]
  );
}

async function getAllPricing({ mysqlQuery }) {
  return mysqlQuery("SELECT * FROM pricing_lookup ORDER BY subtype_normalised");
}

module.exports = { normaliseSubtype, parsePriceBand, formatPriceBand, getPriceBand, setPriceBand, getAllPricing };
