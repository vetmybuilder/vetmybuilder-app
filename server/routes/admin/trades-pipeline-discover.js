// server/routes/admin/trades-pipeline-discover.js
//
// POST /api/admin/trades-pipeline/discover/preview  — cost estimate, no API calls
// POST /api/admin/trades-pipeline/discover/run       — starts discovery job
// GET  /api/admin/trades-pipeline/discover/stream    — SSE progress for a job

const { normaliseCompanyName } = require("../../lib/matchRecommendationToTradesman");
const { isExternalServicesMocked } = require("../../lib/externalServices");
const { syntheticGooglePlace } = require("../../lib/mocks/syntheticExternal");

// In-memory job store (sufficient for single-server admin tool)
const jobs = new Map();

const TRADE_OPTIONS = [
  "Plumber", "Electrician", "Roofer", "Carpenter", "Painter & Decorator",
  "General Builder", "Plasterer", "Tiler", "Landscaper", "Locksmith",
  "Gas Engineer", "Heating Engineer", "Bathroom Fitter", "Kitchen Fitter",
  "Bricklayer", "Damp Proofing", "Drainage", "Guttering", "Fencer",
  "Window Fitter", "Flooring Specialist", "Insulation Installer",
];

const MIN_RATING = 4.0;
const MIN_REVIEWS = 10;

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const log = ctx.log || console;
  const { requireAdmin } = require("../../lib/roles");
  const adminGuard = [auth, requireAdmin(ctx)];

  // ─── Preview (no API calls) ──────────────────────────────────

  router.post("/admin/trades-pipeline/discover/preview", ...adminGuard, async (req, res) => {
    const { trades, areas, area } = req.body;

    // Support both areas (array) and area (string) for backwards compat
    const areaList = Array.isArray(areas) && areas.length > 0
      ? areas
      : area ? [area] : [];

    if (areaList.length === 0) {
      return res.status(400).json({ error: "At least one area is required" });
    }

    const tradeList = Array.isArray(trades) && trades.length > 0
      ? trades
      : TRADE_OPTIONS;

    const searches = [];
    for (const a of areaList) {
      for (const t of tradeList) {
        searches.push({ query: `${t} near ${a}`, trade: t, area: a });
      }
    }

    // Estimate: ~30 results per search, ~50% pass filters
    const estimatedResults = searches.length * 30;
    const estimatedQualifying = Math.round(estimatedResults * 0.5);

    // Cost: $0.032 per Nearby Search + $0.017 per Place Details for qualifying
    const searchCost = searches.length * 0.032;
    const detailsCost = estimatedQualifying * 0.017;
    const totalCost = searchCost + detailsCost;

    res.json({
      searches,
      estimatedResults,
      estimatedQualifying,
      estimatedCost: `$${totalCost.toFixed(2)}`,
      filters: {
        minRating: MIN_RATING,
        minReviews: MIN_REVIEWS,
      },
    });
  });

  // ─── Run discovery ───────────────────────────────────────────

  router.post("/admin/trades-pipeline/discover/run", ...adminGuard, async (req, res) => {
    const { trades, areas, area } = req.body;

    const areaList = Array.isArray(areas) && areas.length > 0
      ? areas
      : area ? [area] : [];

    if (areaList.length === 0) {
      return res.status(400).json({ error: "At least one area is required" });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey && !isExternalServicesMocked()) {
      return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY not configured on server" });
    }

    const tradeList = Array.isArray(trades) && trades.length > 0
      ? trades
      : TRADE_OPTIONS;

    const jobId = `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      id: jobId,
      status: "running",
      events: [],
      listeners: new Set(),
    };
    jobs.set(jobId, job);

    // Respond immediately with jobId
    res.json({ jobId });

    // Run discovery in background
    runDiscovery(job, tradeList, areaList, apiKey, mysqlQuery, log).finally(() => {
      // Clean up job after 5 minutes
      setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
    });
  });

  // ─── SSE stream ──────────────────────────────────────────────

  // SSE: EventSource can't send headers, so accept ?token= query param.
  // We still need admin auth — verify the Firebase token and check admin role.
  router.get("/admin/trades-pipeline/discover/stream", async (req, res) => {
    // Accept token from query param (EventSource) or Authorization header
    let token = "";
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) token = authHeader.slice(7);
    if (!token && typeof req.query.token === "string") token = String(req.query.token);

    if (!token) return res.status(401).json({ error: "Missing token" });

    try {
      const decoded = await ctx.admin.auth().verifyIdToken(token);
      if (!decoded?.uid) return res.status(401).json({ error: "Invalid token" });
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { jobId } = req.query;
    const job = jobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...(req.headers.origin ? { "Access-Control-Allow-Origin": req.headers.origin } : {}),
    });

    // Send all past events first (replay)
    for (const evt of job.events) {
      res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
    }

    // If already finished, close
    if (job.status !== "running") {
      res.end();
      return;
    }

    // Register listener for new events
    const listener = (evt) => {
      try {
        res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
      } catch { /* client disconnected */ }
    };
    job.listeners.add(listener);

    req.on("close", () => {
      job.listeners.delete(listener);
    });
  });
};

// ─── Background discovery runner ─────────────────────────────

async function runDiscovery(job, trades, areas, apiKey, mysqlQuery, log) {
  function emit(event, data) {
    const evt = { event, data };
    job.events.push(evt);
    for (const listener of job.listeners) {
      listener(evt);
    }
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalSearched = 0;

  try {
    const { matchByName } = require("../../lib/companiesHouse");

    // Pre-count all the work so the UI can render a real % bar.
    // = Google searches (trade x area) + CH-pass keywords (per area).
    const { keywordsForArea: _kwForArea } = require("../../lib/admin/chDiscovery");
    let chPassKeywordCount = 0;
    for (const a of areas) chPassKeywordCount += _kwForArea(a).length;
    const totalSearches =
      trades.length * areas.length + chPassKeywordCount;
    emit("progress", {
      message: `Starting discovery: ${trades.length} trade(s) x ${areas.length} area(s) = ${trades.length * areas.length} Google searches + ${chPassKeywordCount} CH keyword(s)`,
      step: 0,
      total: totalSearches,
    });

    let searchNum = 0;
    for (const area of areas) {
    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      searchNum++;
      emit("progress", {
        message: `Searching: ${trade} near ${area} (${searchNum}/${totalSearches})`,
        trade,
        step: searchNum,
        total: totalSearches,
      });

      // Google Places text search (mocked in dev/test)
      let results = [];
      if (isExternalServicesMocked()) {
        // Generate 3 synthetic results per trade/area
        const mockNames = [
          `${trade} Pro Services ${area}`,
          `${area} ${trade} Specialists Ltd`,
          `Premier ${trade} Solutions ${area}`,
        ];
        results = mockNames.map((name) => {
          const mock = syntheticGooglePlace({ name });
          return {
            name,
            place_id: mock?.placeId || `MOCK_${Date.now()}`,
            rating: mock?.rating || 4.5,
            user_ratings_total: mock?.reviewCount || 25,
          };
        });
        emit("progress", { message: `  [MOCK] Generated ${results.length} synthetic results for ${trade} in ${area}`, level: "skip" });
      } else {
        try {
          const query = `${trade} near ${area}`;
          const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          results = data.results || [];
        } catch (err) {
          emit("progress", { message: `  Failed to search "${trade}" in ${area}: ${err.message}`, level: "warn" });
          continue;
        }
      }

      totalSearched += results.length;
      emit("progress", { message: `  Found ${results.length} results for ${trade} in ${area}` });

      for (const place of results) {
        const name = place.name;
        const rating = place.rating || 0;
        const reviewCount = place.user_ratings_total || 0;
        const placeId = place.place_id;

        if (rating < MIN_RATING || reviewCount < MIN_REVIEWS) {
          totalSkipped++;
          continue;
        }

        // Check duplicates
        const existing = await mysqlQuery(
          "SELECT id FROM tradesperson_pipeline WHERE google_place_id = ? LIMIT 1",
          [placeId],
        );
        if (existing.length > 0) {
          emit("progress", { message: `  Skip ${name} — already in pipeline`, level: "skip" });
          totalSkipped++;
          continue;
        }

        const normName = normaliseCompanyName(name);
        const existingTradesmen = await mysqlQuery(
          "SELECT company_name FROM tradesmen WHERE company_name IS NOT NULL LIMIT 500",
        );
        const alreadyOnboarded = existingTradesmen.some(
          (t) => normaliseCompanyName(t.company_name) === normName,
        );
        if (alreadyOnboarded) {
          emit("progress", { message: `  Skip ${name} — already onboarded`, level: "skip" });
          totalSkipped++;
          continue;
        }

        // Companies House
        let chResult = null;
        let chVerified = false;
        try {
          chResult = await matchByName({ name, locationHint: area });
          if (chResult?.verdict === "verified" && chResult?.best) {
            const status = String(chResult.best.status || "").toLowerCase();
            if (status === "dissolved" || status === "dormant") {
              emit("progress", { message: `  Skip ${name} — CH: ${status}`, level: "skip" });
              totalSkipped++;
              continue;
            }
            chVerified = true;
          }
        } catch { /* non-fatal */ }

        // Vetting score
        const ratingPart = (rating || 0) * 10;
        const reviewPart = Math.min(reviewCount || 0, 100) * 0.3;
        const chPart = chVerified ? 20 : 0;
        const vettingScore = Math.round(ratingPart + reviewPart + chPart);

        // Place details (phone, website) — mocked in dev/test
        let phone = null;
        let website = null;
        if (isExternalServicesMocked()) {
          phone = "07700 900" + String(Math.floor(Math.random() * 900) + 100);
          website = null;
        } else {
          try {
            const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,website&key=${apiKey}`;
            const detailResp = await fetch(detailUrl);
            if (detailResp.ok) {
              const detailData = await detailResp.json();
              phone = detailData.result?.formatted_phone_number || null;
              website = detailData.result?.website || null;
            }
          } catch { /* non-fatal */ }
        }

        // Insert
        await mysqlQuery(
          `INSERT INTO tradesperson_pipeline
             (company_name, trade_types, service_areas, google_place_id, google_rating,
              google_reviews_count, company_number, ch_status, ch_name, phone, website,
              vetting_score, status, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
          [
            name, trade, area, placeId, rating, reviewCount,
            chResult?.best?.number || null,
            chResult?.best?.status || null,
            chResult?.best?.name || null,
            phone, website, vettingScore,
          ],
        );

        totalInserted++;
        emit("progress", {
          message: `  Added: ${name} — score ${vettingScore}, ${rating}★ (${reviewCount} reviews)${chVerified ? ", CH verified" : ""}`,
          level: "added",
          company: name,
          score: vettingScore,
        });
      }
    }
    } // end areas loop

    // ── CH pass: pull any companies in the SAME areas that Google
    //    missed (no Google presence, but match selected trades by SIC).
    try {
      const {
        sicsForTrades,
        pickTrade,
        fmtAddress,
        keywordsForArea,
        chAuthHeader,
        chAdvancedSearch,
      } = require("../../lib/admin/chDiscovery");
      const ah = chAuthHeader();
      if (ah) {
        const sics = sicsForTrades(trades);
        emit("progress", {
          message: `── Companies House pass (SIC: ${sics.length} code(s)) ──`,
          step: searchNum,
          total: totalSearches,
        });
        for (const area of areas) {
          const keywords = keywordsForArea(area);
          emit("progress", {
            message: `  CH: ${area} (${keywords.length} keyword(s))`,
            step: searchNum,
            total: totalSearches,
          });
          const byNumber = new Map();
          for (const kw of keywords) {
            const items = await chAdvancedSearch(kw, sics, ah, log);
            for (const c of items) {
              if (c.company_number && !byNumber.has(c.company_number)) {
                byNumber.set(c.company_number, c);
              }
            }
            searchNum++;
            emit("progress", {
              message: `    [${kw}] dedup pool ${byNumber.size}`,
              step: searchNum,
              total: totalSearches,
            });
          }
          for (const c of byNumber.values()) {
            const dup = await mysqlQuery(
              "SELECT id FROM tradesperson_pipeline WHERE company_number = ? LIMIT 1",
              [c.company_number],
            );
            if (dup.length > 0) continue;
            const onboarded = await mysqlQuery(
              "SELECT 1 FROM tradesmen WHERE company_number = ? LIMIT 1",
              [c.company_number],
            );
            if (onboarded.length > 0) continue;
            const trade = pickTrade(c.sic_codes);
            const postcode = c?.registered_office_address?.postal_code || null;
            await mysqlQuery(
              `INSERT INTO tradesperson_pipeline
                 (company_name, trade_types, service_areas, company_number,
                  ch_status, ch_name, vetting_score, status, discovered_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
              [
                c.company_name || "",
                trade,
                `${area}${postcode ? " (" + postcode + ")" : ""}`,
                c.company_number,
                c.company_status || null,
                c.company_name || null,
                0,
              ],
            );
            totalInserted++;
            emit("progress", {
              message: `  Added (CH-only): ${c.company_name} (${c.company_number}) - ${trade}`,
              level: "added",
              company: c.company_name,
            });
          }
        }
      } else {
        emit("progress", {
          message: "  CH pass skipped - CH_KEY not configured",
          level: "warn",
        });
      }
    } catch (chErr) {
      emit("progress", {
        message: `  CH pass error: ${chErr.message}`,
        level: "warn",
      });
    }

    emit("done", {
      message: `Discovery complete. Searched ${totalSearched}, added ${totalInserted}, skipped ${totalSkipped}.`,
      inserted: totalInserted,
      skipped: totalSkipped,
      searched: totalSearched,
    });
  } catch (err) {
    log.error?.({ err: err?.message }, "Discovery job failed");
    emit("error", { message: `Discovery failed: ${err.message}` });
  }

  job.status = "done";
}
