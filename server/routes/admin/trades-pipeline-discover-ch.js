// server/routes/admin/trades-pipeline-discover-ch.js
//
// Companies House discovery for the trade-pipeline admin tool. Parallel
// to trades-pipeline-discover.js (Google Places) - same UI patterns
// (POST preview, POST run, GET stream), same target table
// (tradesperson_pipeline), but discovers via Companies House Advanced
// Search filtered by residential-construction SIC codes.
//
// Endpoints:
//   POST /api/admin/trades-pipeline/discover-ch/preview
//   POST /api/admin/trades-pipeline/discover-ch/run
//   GET  /api/admin/trades-pipeline/discover-ch/stream
//
// Companies House does NOT expose emails / phone numbers - rows land in
// the pipeline with phone=NULL website=NULL email=NULL. Admin enriches
// manually before outreach.

const {
  BOROUGH_KEYWORDS,
  SIC_CODES,
  sicsForTrades,
  pickTrade,
  fmtAddress,
  keywordsForArea,
  chAuthHeader,
  chAdvancedSearch,
} = require("../../lib/admin/chDiscovery");

const jobs = new Map();

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const log = ctx.log || console;
  const { requireAdmin } = require("../../lib/roles");
  const adminGuard = [auth, requireAdmin(ctx)];

  // ─── Preview (no API calls) ──────────────────────────────────
  router.post(
    "/admin/trades-pipeline/discover-ch/preview",
    ...adminGuard,
    (req, res) => {
      const { areas, boroughs, trades } = req.body || {};
      // Back-compat: accept either `areas` (new) or `boroughs` (legacy).
      const list = Array.isArray(areas) && areas.length > 0
        ? areas
        : Array.isArray(boroughs) && boroughs.length > 0
          ? boroughs
          : Object.keys(BOROUGH_KEYWORDS);
      if (list.length === 0) {
        return res.status(400).json({ error: "At least one area is required" });
      }
      // Expand each area to its CH search keywords.
      let totalKeywords = 0;
      for (const a of list) totalKeywords += keywordsForArea(a).length;
      const sics = sicsForTrades(trades);
      const sicFraction = sics.length / SIC_CODES.length;
      const estimatedCompanies = Math.round(list.length * 250 * sicFraction);
      const estimatedSeconds = Math.ceil(totalKeywords * 4);
      return res.json({
        boroughs: list,
        trades: Array.isArray(trades) ? trades : [],
        sicCodes: sics,
        totalKeywords,
        estimatedCompanies,
        estimatedSeconds,
        cost: "free (Companies House API)",
      });
    },
  );

  // ─── Run discovery ───────────────────────────────────────────
  router.post(
    "/admin/trades-pipeline/discover-ch/run",
    ...adminGuard,
    (req, res) => {
      const { areas, boroughs } = req.body || {};
      const list = Array.isArray(areas) && areas.length > 0
        ? areas
        : Array.isArray(boroughs) && boroughs.length > 0
          ? boroughs
          : [];
      if (list.length === 0) {
        return res.status(400).json({ error: "At least one area is required" });
      }
      const ah = chAuthHeader();
      if (!ah) {
        return res.status(500).json({ error: "CH_KEY not configured" });
      }

      const jobId = `disc_ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job = {
        id: jobId,
        status: "running",
        events: [],
        listeners: new Set(),
      };
      jobs.set(jobId, job);
      res.json({ jobId });

      const sics = sicsForTrades(req.body?.trades);
      runChDiscovery(job, list, sics, ah, mysqlQuery, log).finally(() => {
        setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
      });
    },
  );

  // ─── SSE stream ──────────────────────────────────────────────
  router.get("/admin/trades-pipeline/discover-ch/stream", async (req, res) => {
    let token = "";
    const authHeaderVal = req.headers.authorization || "";
    if (authHeaderVal.startsWith("Bearer ")) token = authHeaderVal.slice(7);
    if (!token && typeof req.query.token === "string") {
      token = String(req.query.token);
    }
    if (!token) return res.status(401).json({ error: "Missing token" });

    try {
      const decoded = await ctx.admin.auth().verifyIdToken(token);
      if (!decoded?.uid) return res.status(401).json({ error: "Invalid token" });
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { jobId } = req.query;
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...(req.headers.origin
        ? { "Access-Control-Allow-Origin": req.headers.origin }
        : {}),
    });

    for (const evt of job.events) {
      res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
    }
    if (job.status !== "running") {
      res.end();
      return;
    }
    const listener = (evt) => {
      try {
        res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
      } catch {
        /* client disconnected */
      }
    };
    job.listeners.add(listener);
    req.on("close", () => job.listeners.delete(listener));
  });
};

// ─── Background discovery runner ─────────────────────────────

async function runChDiscovery(job, areas, sics, ah, mysqlQuery, log) {
  function emit(event, data) {
    const evt = { event, data };
    job.events.push(evt);
    for (const listener of job.listeners) listener(evt);
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFound = 0;

  // Count up all CH keyword searches so the UI can render a real %.
  let stepsTotal = 0;
  for (const a of areas) stepsTotal += keywordsForArea(a).length;
  let stepsDone = 0;

  try {
    emit("progress", {
      message: `Starting Companies House discovery for ${areas.length} area(s) - ${sics.length}/${SIC_CODES.length} SIC code(s)`,
      step: stepsDone,
      total: stepsTotal,
    });

    for (const area of areas) {
      const keywords = keywordsForArea(area);
      emit("progress", {
        message: `== ${area} == (${keywords.length} keywords)`,
        step: stepsDone,
        total: stepsTotal,
      });
      const byNumber = new Map();
      for (const kw of keywords) {
        const items = await chAdvancedSearch(kw, sics, ah, log);
        let added = 0;
        for (const c of items) {
          if (c.company_number && !byNumber.has(c.company_number)) {
            byNumber.set(c.company_number, c);
            added++;
          }
        }
        stepsDone++;
        emit("progress", {
          message: `  [${kw}] +${added} (running total ${byNumber.size})`,
          step: stepsDone,
          total: stepsTotal,
        });
      }

      totalFound += byNumber.size;

      for (const c of byNumber.values()) {
        const companyNumber = c.company_number;
        const companyName = c.company_name || "";
        const trade = pickTrade(c.sic_codes);
        const postcode = c?.registered_office_address?.postal_code || null;
        const address = fmtAddress(c?.registered_office_address);

        // Dedupe by company_number against the pipeline.
        const existing = await mysqlQuery(
          "SELECT id FROM tradesperson_pipeline WHERE company_number = ? LIMIT 1",
          [companyNumber],
        );
        if (existing.length > 0) {
          totalSkipped++;
          continue;
        }

        // Skip if already onboarded as a tradesperson.
        const onboarded = await mysqlQuery(
          "SELECT 1 FROM tradesmen WHERE company_number = ? LIMIT 1",
          [companyNumber],
        );
        if (onboarded.length > 0) {
          totalSkipped++;
          continue;
        }

        await mysqlQuery(
          `INSERT INTO tradesperson_pipeline
             (company_name, trade_types, service_areas, company_number,
              ch_status, ch_name, vetting_score, status, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
          [
            companyName,
            trade,
            `${area}${postcode ? " (" + postcode + ")" : ""}`,
            companyNumber,
            c.company_status || null,
            companyName,
            0,
          ],
        );
        totalInserted++;
        emit("progress", {
          message: `  Added: ${companyName} (${companyNumber}) - ${trade}`,
          level: "added",
          company: companyName,
        });
      }
    }

    emit("done", {
      message: `Discovery complete. Found ${totalFound}, added ${totalInserted}, skipped ${totalSkipped} duplicates.`,
      inserted: totalInserted,
      skipped: totalSkipped,
      found: totalFound,
    });
  } catch (err) {
    log.error?.({ err: err?.message }, "[discover-ch] job failed");
    emit("error", { message: `Discovery failed: ${err.message}` });
  }

  job.status = "done";
}
