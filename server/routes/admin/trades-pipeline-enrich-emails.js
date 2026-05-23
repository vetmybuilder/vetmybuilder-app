// server/routes/admin/trades-pipeline-enrich-emails.js
//
// Try to find a contact email for each pending pipeline row that
// doesn't have one yet. Companies House doesn't expose emails, so we
// guess candidate domains from the company name, fetch the homepage if
// it resolves, and regex-extract the first plausible mail address.
//
// Hit-rate is rough (~25-35%) - companies with no website or with
// hard-to-guess domains get skipped. Run it after every discovery pass;
// the un-enriched rows still need manual lookup (Hunter.io / LinkedIn).
//
// Endpoints:
//   POST /api/admin/trades-pipeline/enrich-emails/run
//        body: { limit?: number }   default 50
//        Streams via SSE on the same job pattern as discover-ch.
//   GET  /api/admin/trades-pipeline/enrich-emails/stream

const jobs = new Map();

const HTTP_TIMEOUT_MS = 4000;
const PER_ROW_THROTTLE_MS = 250;

// Suffixes to strip from a company name when building candidate domains.
const STRIP_SUFFIXES = [
  / limited$/i,
  / ltd\.?$/i,
  / l\.?l\.?p\.?$/i,
  / inc\.?$/i,
  / plc$/i,
];

const BLOCKLIST_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "domain.com",
  "yourdomain.com",
  "test.com",
  "sentry.io",
  "wixpress.com",
  "wix.com",
  "godaddy.com",
  "sentry-next.wixpress.com",
]);

function slugify(name) {
  let s = String(name || "").toLowerCase();
  for (const re of STRIP_SUFFIXES) s = s.replace(re, "");
  s = s
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return s;
}

function candidateDomains(companyName) {
  const slug = slugify(companyName);
  if (!slug || slug.length < 3) return [];
  return [
    `https://www.${slug}.co.uk`,
    `https://${slug}.co.uk`,
    `https://www.${slug}.com`,
    `https://${slug}.com`,
  ];
}

async function fetchWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; vmb-pipeline-enrich/1; +https://vetmybuilder.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function extractEmails(html) {
  if (!html) return [];
  const out = new Set();
  // mailto: links first - cleanest signal
  const mailtoRe = /mailto:([^"'>\s?]+)/gi;
  let m;
  while ((m = mailtoRe.exec(html))) {
    const candidate = m[1].split("?")[0].toLowerCase();
    if (candidate.includes("@")) out.add(candidate);
  }
  // Plain text emails
  const matches = html.match(EMAIL_RE) || [];
  for (const e of matches) out.add(e.toLowerCase());
  return [...out].filter((e) => {
    const domain = e.split("@")[1] || "";
    return !BLOCKLIST_EMAIL_DOMAINS.has(domain);
  });
}

// Pick the email that best looks like a real business contact.
function chooseBest(emails, companyName) {
  if (!emails || emails.length === 0) return null;
  const slug = slugify(companyName);
  const scored = emails
    .map((e) => {
      const [local, domain] = e.split("@");
      let score = 0;
      if (/^(info|hello|contact|enquiries|sales|admin|office)$/i.test(local)) {
        score += 10;
      }
      if (slug && domain?.replace(/\./g, "").includes(slug)) score += 5;
      if (/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(e)) score -= 50;
      if (/(wixpress|sentry|godaddy)/i.test(domain)) score -= 20;
      return { email: e, score };
    })
    .filter((x) => x.score > -10)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.email || null;
}

// Use the same verifier the tradesperson leaderboard uses so we don't
// save dud / parked / brand-mismatched URLs into the pipeline.
const { verifyWebsite } = require("../../lib/webPresence");

async function findEmailForCompany(companyName) {
  const urls = candidateDomains(companyName);
  let lastSkipReason = null;
  for (const url of urls) {
    // 1. Verify the candidate is a real site for this company.
    let v;
    try {
      v = await verifyWebsite(url, { vendorName: companyName });
    } catch {
      lastSkipReason = "verify_error";
      continue;
    }
    if (!v?.ok) {
      lastSkipReason = v?.reason || "unverified";
      continue;
    }

    // 2. Verified - scrape the homepage and /contact for emails.
    let res;
    try {
      res = await fetchWithTimeout(url, HTTP_TIMEOUT_MS);
    } catch {
      continue;
    }
    if (!res.ok) continue;
    let html = "";
    try {
      html = await res.text();
    } catch {
      continue;
    }
    const emails = extractEmails(html);
    const best = chooseBest(emails, companyName);
    if (best) return { website: res.url || url, email: best };
    try {
      const contactUrl = new URL("/contact", url).toString();
      const c = await fetchWithTimeout(contactUrl, HTTP_TIMEOUT_MS);
      if (c.ok) {
        const ch = await c.text();
        const ems = extractEmails(ch);
        const b2 = chooseBest(ems, companyName);
        if (b2) return { website: res.url || url, email: b2 };
      }
    } catch {
      /* ignore */
    }
    return { website: res.url || url, email: null };
  }
  return lastSkipReason ? { skipReason: lastSkipReason } : null;
}

module.exports = (router, ctx) => {
  const { mysqlQuery, auth } = ctx;
  const log = ctx.log || console;
  const { requireAdmin } = require("../../lib/roles");
  const adminGuard = [auth, requireAdmin(ctx)];

  router.post(
    "/admin/trades-pipeline/enrich-emails/run",
    ...adminGuard,
    async (req, res) => {
      const limit = Math.min(
        500,
        Math.max(1, Number(req.body?.limit) || 50),
      );

      const jobId = `enrich_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const job = {
        id: jobId,
        status: "running",
        events: [],
        listeners: new Set(),
      };
      jobs.set(jobId, job);
      res.json({ jobId });

      runEnrichment(job, limit, mysqlQuery, log).finally(() => {
        setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
      });
    },
  );

  router.get(
    "/admin/trades-pipeline/enrich-emails/stream",
    async (req, res) => {
      let token = "";
      const authHeaderVal = req.headers.authorization || "";
      if (authHeaderVal.startsWith("Bearer ")) {
        token = authHeaderVal.slice(7);
      }
      if (!token && typeof req.query.token === "string") {
        token = String(req.query.token);
      }
      if (!token) return res.status(401).json({ error: "Missing token" });

      try {
        const decoded = await ctx.admin.auth().verifyIdToken(token);
        if (!decoded?.uid) {
          return res.status(401).json({ error: "Invalid token" });
        }
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
        res.write(
          `event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`,
        );
      }
      if (job.status !== "running") {
        res.end();
        return;
      }
      const listener = (evt) => {
        try {
          res.write(
            `event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`,
          );
        } catch {
          /* client disconnected */
        }
      };
      job.listeners.add(listener);
      req.on("close", () => job.listeners.delete(listener));
    },
  );
};

async function runEnrichment(job, limit, mysqlQuery, log) {
  function emit(event, data) {
    const evt = { event, data };
    job.events.push(evt);
    for (const listener of job.listeners) listener(evt);
  }

  let scanned = 0;
  let updated = 0;
  let missed = 0;

  try {
    // LIMIT inlined (validated integer; mysql2 doesn't bind LIMIT
    // cleanly via prepared statements).
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
    const rows = await mysqlQuery(
      `SELECT id, company_name
         FROM tradesperson_pipeline
        WHERE status = 'pending'
          AND (email IS NULL OR email = '')
          AND company_name IS NOT NULL
        ORDER BY discovered_at DESC
        LIMIT ${safeLimit}`,
    );
    const total = rows.length;
    emit("progress", {
      message: `Enriching up to ${total} pending row(s)...`,
      step: 0,
      total,
    });

    for (const row of rows) {
      scanned++;
      const result = await findEmailForCompany(row.company_name);
      if (result?.email) {
        await mysqlQuery(
          `UPDATE tradesperson_pipeline
              SET email = ?, website = COALESCE(NULLIF(website, ''), ?)
            WHERE id = ?`,
          [result.email, result.website || null, row.id],
        );
        updated++;
        emit("progress", {
          message: `  Found ${row.company_name} -> ${result.email}`,
          level: "added",
          step: scanned,
          total,
        });
      } else if (result?.website) {
        // Verified site but no email on it - save the URL only.
        await mysqlQuery(
          `UPDATE tradesperson_pipeline
              SET website = COALESCE(NULLIF(website, ''), ?)
            WHERE id = ?`,
          [result.website, row.id],
        );
        missed++;
        emit("progress", {
          message: `  Site verified but no email found for ${row.company_name}`,
          level: "skip",
          step: scanned,
          total,
        });
      } else {
        missed++;
        const reason = result?.skipReason
          ? ` (${result.skipReason})`
          : "";
        emit("progress", {
          message: `  No real website for ${row.company_name}${reason}`,
          level: "skip",
          step: scanned,
          total,
        });
      }
      await new Promise((r) => setTimeout(r, PER_ROW_THROTTLE_MS));
    }

    emit("done", {
      message: `Enrichment complete. Scanned ${scanned}, found ${updated}, missed ${missed}.`,
      scanned,
      updated,
      missed,
    });
  } catch (err) {
    log.error?.({ err: err?.message }, "[enrich-emails] failed");
    emit("error", { message: `Enrichment failed: ${err.message}` });
  }
  job.status = "done";
}
