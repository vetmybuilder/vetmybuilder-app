#!/usr/bin/env node
// scripts/discover-tradesmen.js
//
// Usage: node scripts/discover-tradesmen.js --trade=Plumber --area=E4
//
// Discovers tradespeople via Google Places + Companies House, scores them,
// generates AI review summaries, and inserts into tradesperson_pipeline.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { matchByName } = require("../server/lib/companiesHouse");
const { complete } = require("../server/lib/ai/llmClient");
const { normaliseCompanyName } = require("../server/lib/matchRecommendationToTradesman");

// Parse CLI args
const args = {};
process.argv.slice(2).forEach((arg) => {
  const [key, val] = arg.replace(/^--/, "").split("=");
  if (key && val) args[key] = val;
});

const trade = args.trade;
const area = args.area;
const dryRun = args["dry-run"] === "true" || args["dry-run"] === "" || process.argv.includes("--dry-run");

if (!trade || !area) {
  console.error("Usage: node scripts/discover-tradesmen.js --trade=Plumber --area=E4 [--dry-run]");
  process.exit(1);
}

const MIN_RATING = 4.5;
const MIN_REVIEWS = 20;

function computeVettingScore(rating, reviewCount, chVerified) {
  const ratingPart = (rating || 0) * 10;
  const reviewPart = Math.min(reviewCount || 0, 100) * 0.3;
  const chPart = chVerified ? 20 : 0;
  return Math.round(ratingPart + reviewPart + chPart);
}

async function searchGooglePlaces(query, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Google Places text search failed: ${resp.status}`);
  }
  const data = await resp.json();
  return data.results || [];
}

async function fetchPlaceDetails(placeId, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,website&key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Google Places details failed: ${resp.status}`);
  }
  const data = await resp.json();
  return data.result || {};
}

async function main() {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "vetmybuilder",
  });

  const mysqlQuery = async (sql, params) => {
    const [rows] = await pool.query(sql, params);
    return rows;
  };

  if (dryRun) console.log(`[DRY RUN] No API calls or DB writes will be made.\n`);
  console.log(`\nDiscovering ${trade} tradespeople near ${area}...\n`);

  if (dryRun) {
    const searchQuery = `${trade} near ${area}`;
    console.log(`  Would search Google Places: "${searchQuery}"`);
    console.log(`  Would filter by: rating >= ${MIN_RATING}, reviews >= ${MIN_REVIEWS}`);
    console.log(`  Would verify against Companies House`);
    console.log(`  Would generate AI review summaries`);
    console.log(`  Would insert qualifying entries as "pending" into tradesperson_pipeline`);
    console.log(`\n  Estimated API cost: ~$0.05 per qualifying business`);
    console.log(`  Typical results for a single trade/area: 20-60 businesses`);
    console.log(`  Estimated cost for this run: $1-3\n`);
    await pool.end();
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY not set");
    await pool.end();
    process.exit(1);
  }

  // 1. Search Google Places
  let results;
  try {
    const searchQuery = `${trade} near ${area}`;
    results = await searchGooglePlaces(searchQuery, apiKey);
    console.log(`Google Places returned ${results.length} results`);
  } catch (err) {
    console.error("Google Places search failed:", err.message);
    await pool.end();
    process.exit(1);
  }

  let passed = 0;
  let skippedExisting = 0;
  let inserted = 0;

  for (const place of results) {
    const name = place.name;
    const rating = place.rating || 0;
    const reviewCount = place.user_ratings_total || 0;
    const placeId = place.place_id;

    // Filter by rating + reviews
    if (rating < MIN_RATING || reviewCount < MIN_REVIEWS) {
      console.log(`  SKIP ${name} — rating ${rating}, ${reviewCount} reviews (below threshold)`);
      continue;
    }

    passed++;

    // Check if already in pipeline
    const existingPipeline = await mysqlQuery(
      "SELECT id FROM tradesperson_pipeline WHERE google_place_id = ? LIMIT 1",
      [placeId],
    );
    if (existingPipeline.length > 0) {
      console.log(`  SKIP ${name} — already in pipeline`);
      skippedExisting++;
      continue;
    }

    // Check if already onboarded (by normalised company name)
    const normName = normaliseCompanyName(name);
    const existingTradesmen = await mysqlQuery(
      "SELECT company_name FROM tradesmen WHERE company_name IS NOT NULL LIMIT 500",
    );
    const alreadyOnboarded = existingTradesmen.some(
      (t) => normaliseCompanyName(t.company_name) === normName,
    );
    if (alreadyOnboarded) {
      console.log(`  SKIP ${name} — already onboarded`);
      skippedExisting++;
      continue;
    }

    // Companies House verification
    let chResult = null;
    let chVerified = false;
    try {
      chResult = await matchByName({ name, locationHint: area });
      if (chResult?.verdict === "verified" && chResult?.best) {
        const created = chResult.best.dateOfCreation;
        if (created) {
          const ageMs = Date.now() - new Date(created).getTime();
          const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
          if (ageYears < 1) {
            console.log(`  SKIP ${name} — CH: less than 1 year old`);
            continue;
          }
        }
        const status = String(chResult.best.status || "").toLowerCase();
        if (status === "dissolved" || status === "dormant") {
          console.log(`  SKIP ${name} — CH: ${status}`);
          continue;
        }
        chVerified = true;
      }
    } catch (err) {
      console.log(`  WARN ${name} — CH lookup failed: ${err.message}`);
    }

    // Compute vetting score
    const vettingScore = computeVettingScore(rating, reviewCount, chVerified);

    // AI review summary (advisory only)
    let aiSummary = null;
    try {
      const llmResult = await complete({
        feature: "pipeline_review_summary",
        system:
          "You summarise Google Reviews sentiment for a tradesperson in 2-3 sentences. Focus on reliability, quality of work, and any safety concerns. Be honest and concise.",
        user: `Summarise the reputation of "${name}" based on their Google rating of ${rating} from ${reviewCount} reviews. They are a ${trade} in the ${area} area.`,
        stub: `${name} has a strong reputation with ${rating} stars from ${reviewCount} reviews. Customers highlight quality workmanship and reliability.`,
        maxTokens: 128,
        mysqlQuery,
      });
      aiSummary = llmResult.text;
    } catch {
      // Non-fatal — proceed without summary
      aiSummary = null;
    }

    // Fetch phone/website from Google Place Details API
    let phone = null;
    let website = null;
    try {
      const details = await fetchPlaceDetails(placeId, apiKey);
      phone = details.formatted_phone_number || null;
      website = details.website || null;
    } catch {
      // Non-fatal — proceed without contact details
    }

    // Insert into pipeline
    await mysqlQuery(
      `INSERT INTO tradesperson_pipeline
         (company_name, trade_types, service_areas, google_place_id, google_rating,
          google_reviews_count, company_number, ch_status, ch_name, phone, website,
          ai_review_summary, vetting_score, status, discovered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        name,
        trade,
        area,
        placeId,
        rating,
        reviewCount,
        chResult?.best?.number || null,
        chResult?.best?.status || null,
        chResult?.best?.name || null,
        phone,
        website,
        aiSummary,
        vettingScore,
      ],
    );

    console.log(
      `  ADD ${name} — score ${vettingScore}, rating ${rating}, ${reviewCount} reviews${chVerified ? ", CH verified" : ""}`,
    );
    inserted++;
  }

  console.log(
    `\nDone. Found ${results.length}, passed ${passed}, skipped ${skippedExisting} existing, added ${inserted} new.\n`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error("Discovery failed:", err);
  process.exit(1);
});
