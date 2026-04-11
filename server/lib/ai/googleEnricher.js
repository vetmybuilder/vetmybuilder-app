// server/lib/ai/googleEnricher.js
const googlePlaces = require("../googlePlaces");
const llmClient = require("./llmClient");

const FEATURE = "google_match_verify";

const VERIFY_SYSTEM_PROMPT = `You verify whether a Google Places result matches a tradesman's company.

Given the tradesman's company name and the Google result (name + address), decide if they are the same business.

Consider:
- Name variations (Ltd, Limited, abbreviations, trading names)
- Location consistency
- Trade/industry alignment

Respond with ONLY valid JSON:
{"match": true, "confidence": "high"}

confidence must be "high", "medium", or "low".
match is true or false.`;

const VERIFY_STUB = JSON.stringify({ match: true, confidence: "high" });

function parseJsonResponse(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try { return JSON.parse(text.slice(first, last + 1)); } catch { return null; }
    }
    return null;
  }
}

async function enrichTradesmanWithGoogle({
  mysqlQuery,
  userId,
  companyName,
  locationHint,
  existingWebUrl,
  log = console,
}) {
  const TAG = "[google-enricher]";

  try {
    if (!companyName || !userId) return null;

    // 1. Google Places Text Search
    const place = await googlePlaces.lookupBusiness({
      name: companyName,
      locationHint: locationHint || undefined,
    });

    if (!place || !place.placeId) {
      log.info?.(`${TAG} no Google result`, { userId, companyName });
      return null;
    }

    // 2. LLM verification
    const userPrompt = [
      `Tradesman company name: "${companyName}"`,
      `Google result name: "${place.name}"`,
      `Google result address: "${place.address || "unknown"}"`,
      "",
      "Are these the same business?",
    ].join("\n");

    let verifyResult;
    try {
      verifyResult = await llmClient.complete({
        feature: FEATURE,
        system: VERIFY_SYSTEM_PROMPT,
        user: userPrompt,
        stub: VERIFY_STUB,
        maxTokens: 100,
        mysqlQuery,
        log,
      });
    } catch (err) {
      log.warn?.(`${TAG} LLM verify failed`, { userId, error: err?.message });
      return null;
    }

    const verification = parseJsonResponse(verifyResult.text);
    if (!verification || !verification.match) {
      log.info?.(`${TAG} LLM rejected match`, { userId, companyName, googleName: place.name });
      return null;
    }

    if (verification.confidence === "low") {
      log.info?.(`${TAG} LLM match low confidence — skipping`, { userId });
      return null;
    }

    // 3. Place Details for website (only if tradesman has no web_url)
    let website = null;
    if (!existingWebUrl) {
      try {
        const details = await googlePlaces.getPlaceDetails(place.placeId, ["website"]);
        website = details?.website || null;
      } catch (err) {
        log.warn?.(`${TAG} Place Details failed`, { userId, error: err?.message });
      }
    }

    // 4. Upsert Google data on tradesmen row
    try {
      const sets = [
        "google_place_id = ?",
        "google_rating = ?",
        "google_reviews_count = ?",
      ];
      const params = [
        place.placeId,
        place.rating ?? null,
        place.userRatingsTotal ?? 0,
      ];

      if (website && !existingWebUrl) {
        sets.push("web_url = ?");
        params.push(website);
      }

      params.push(userId);

      await mysqlQuery(
        `UPDATE tradesmen SET ${sets.join(", ")} WHERE user_id = ?`,
        params,
      );

      log.info?.(`${TAG} enriched`, {
        userId,
        placeId: place.placeId,
        rating: place.rating,
        reviews: place.userRatingsTotal,
        website: website || "(skipped)",
      });
    } catch (err) {
      log.error?.(`${TAG} DB upsert failed`, { userId, error: err?.message });
      return null;
    }

    return {
      placeId: place.placeId,
      rating: place.rating ?? null,
      reviewsCount: place.userRatingsTotal ?? 0,
      website,
      verified: true,
    };
  } catch (err) {
    log.error?.(`${TAG} unexpected error`, { userId, error: err?.message });
    return null;
  }
}

module.exports = { enrichTradesmanWithGoogle, FEATURE };
