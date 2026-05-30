// server/routes/tradesmen/join.post.js

/**
 * POST /tradesmen/join   (no auth)
 * Saves a draft vendor (user_id = lead_*), runs CH match + web check,
 * and computes VMB score on the 0.0-10.0 scale.
 *
 * Security: this route is intentionally public (supply-side "claim my
 * business" flow), so we lean on three defences instead of auth:
 *   1. Zod schema validation on req.body - reject anything unexpected.
 *   2. express-rate-limit per IP - 5 requests / 15min on this route.
 *   3. URL hygiene: every persisted URL must pass normalizeUrl and start
 *      with https:// (no http://internal-host/...). webPresence.js does
 *      the heavy SSRF lifting (DNS + private-IP block) before fetch.
 */
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const analytics = require("../../lib/analytics");
const { claimPipelineEntry } = require("../../lib/claimPipelineEntry");
const { normalizeUrl } = require("../../lib/webPresence");

// ---------- input schema ----------
const DocSchema = z.object({
  type: z.string().max(80),
  label: z.string().max(200),
  fileKey: z.string().max(300).optional(),
  fileUrl: z.string().url().max(500).optional(),
  // Allow extra harmless fields the form might send (customType, expiresOn,
  // legacy name/size/type from File objects). Zod's default strips them.
}).passthrough();

const JoinSchema = z.object({
  companyName: z.string().min(2).max(120),
  tradeTypes: z.string().max(500).optional(),
  serviceAreas: z.string().max(500).optional(),
  websites: z.array(z.string().url().max(500)).max(10).optional(),
  docs: z.array(DocSchema).max(20).optional(),
  workPhotos: z.array(z.string().url().max(500)).max(20).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional(),
  contactName: z.string().max(120).optional(),
  companyNumber: z.string().max(20).optional(),
  offer: z
    .object({
      discountMin: z.number().min(0).max(100).optional(),
      discountMax: z.number().min(0).max(100).optional(),
      warranty: z.string().max(50).optional(),
    })
    .optional(),
  likesCount: z.number().int().min(0).max(100000).optional(),
  winsCount: z.number().int().min(0).max(100000).optional(),
  // Acquisition ref captured on the signup landing page (?ref=...).
  // Same alphabet as the /go/:code route enforces so a fuzzed value
  // never reaches the DB.
  acquisitionRef: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
}).passthrough();

// Per-IP limiter for the join route specifically. 5 attempts per 15min
// is enough for a legit retry after a typo, far below what an abuser
// would need to scrape or fuzz.
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited" },
  // Match the skip pattern in server/lib/rateLimiters.js so vitest + E2E
  // don't trip the limit when the same test shard fires many join calls.
  skip: () =>
    process.env.NODE_ENV === "test" ||
    process.env.PILOT_AREAS_BYPASS === "1",
});

// httpsOnly: keep only URLs that survive normalizeUrl AND start with
// https://. We don't want plain-http URLs persisted for trade marketing,
// and normalizeUrl already drops anything that resolves to a private host
// via its scheme/IP literal checks.
function httpsOnly(urls) {
  const out = [];
  for (const raw of urls) {
    const norm = normalizeUrl(raw);
    if (norm && /^https:\/\//i.test(norm)) out.push(norm);
  }
  return out;
}

module.exports = (router, ctx) => {
  const { enrichTradesmanWithGoogle } = require("../../lib/ai/googleEnricher");
  const { mysqlQuery, matchByName, extractLocationTokens } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/join.post]";
  const ROUTE = "/tradesmen/join";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  // Optional web presence verifier
  let verifyWebPresence = async () => ({ ok: false });
  try {
    verifyWebPresence =
      require("../../lib/webPresence").verifyWebPresence || verifyWebPresence;
  } catch {
    log.warn(`${TAG} webPresence helper missing, continuing`);
  }

  // ---------- helpers ----------
  const int = (v, d = 0) => {
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : d;
  };

  const toArrayCsv = (x) =>
    Array.isArray(x)
      ? x
      : typeof x === "string"
      ? x
          .split(/[,;|]/g)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const warrantyToMonths = (key) => {
    const map = { none: 0, "3m": 3, "6m": 6, "12m": 12, "24m+": 24 };
    return map[String(key || "none")] ?? 0;
  };

  const warrantyPoints = (months) => {
    const m = Math.max(0, int(months, 0));
    if (m >= 36) return 20;
    if (m >= 24) return 18;
    if (m >= 12) return 12;
    if (m >= 6) return 9;
    if (m >= 3) return 6;
    return 0;
  };

  /** Compute VMB score 0-10.0 (1dp) */
  function computeScore10(row) {
    const areas = toArrayCsv(row.service_areas);
    const trades = toArrayCsv(row.trade_types);
    const photos = int(row.photo_count, 0);
    const docs = int(row.supporting_doc_count, 0);
    const discountAny =
      int(row.discount_min_percent, 0) > 0 ||
      int(row.discount_max_percent, 0) > 0;
    const chOK = String(row.ch_status || "").toLowerCase() === "verified";
    const webOK = int(row.web_verified, 0) === 1;

    const likes = int(row.likes_count, 0);
    const wins = int(row.wins_count, 0);

    let s100 = 0;
    s100 += areas.length >= 3 ? 10 : 0;
    s100 += webOK ? 5 : 0;
    s100 += chOK ? 25 : 0;
    s100 += trades.length >= 3 ? 15 : 0;
    s100 += photos >= 3 ? 15 : 0;
    s100 += discountAny ? 5 : 0;
    s100 += warrantyPoints(row.warranty_months);
    s100 += docs >= 2 ? 10 : 0;

    const winsPts = Math.min(15, wins * 3);
    const likesPts = Math.min(5, Math.floor(likes / 20));
    s100 += winsPts + likesPts;

    s100 = Math.max(0, Math.min(100, s100));
    const s10 = Math.round((s100 / 10) * 10) / 10;
    return s10;
  }

  if (!ctx.__mounted_join_post) {
    ctx.__mounted_join_post = true;
    const base = ctx.API_PREFIX || "/api";
    log.info(`[routes] mounted: POST ${base}${ROUTE}`);
  }

  // ---------- ROUTE ----------
  router.post(ROUTE, joinLimiter, async (req, res) => {
    // Validate body up front. Anything that fails the schema gets a
    // structured 400 instead of being silently coerced.
    let payload;
    try {
      payload = JoinSchema.parse(req.body || {});
    } catch (err) {
      const details = err?.issues || err?.errors || [];
      log.warn(`${TAG} invalid payload`, { details });
      return res.status(400).json({ error: "invalid_payload", details });
    }

    const companyName = payload.companyName.trim();
    if (!companyName) {
      // Zod's min(2) covers most of this, but a string of pure whitespace
      // still passes min(2). Preserve the old explicit error.
      return res.status(400).json({ error: "companyName is required" });
    }

    log.info(`${TAG} hit`, {
      companyName,
      tradeTypes: payload.tradeTypes,
      serviceAreas: payload.serviceAreas,
    });

    const trade_types = String(payload.tradeTypes || "").trim();
    const service_areas = String(payload.serviceAreas || "").trim();

    // URL hygiene: drop anything that doesn't normalise to a clean https
    // URL. webPresence.normalizeUrl already rejects non-http(s) schemes
    // and bare-IP private hosts. The /^https:\/\// gate kills the
    // remaining http:// case so we never persist plaintext URLs.
    const websitesIn = Array.isArray(payload.websites) ? payload.websites : [];
    const websites = httpsOnly(websitesIn);
    const photosIn = Array.isArray(payload.workPhotos) ? payload.workPhotos : [];
    const photos = httpsOnly(photosIn);
    const docs = Array.isArray(payload.docs) ? payload.docs : [];

    const discountMin = int(payload?.offer?.discountMin, 0);
    const discountMax = int(payload?.offer?.discountMax, 0);
    const warranty_months = warrantyToMonths(payload?.offer?.warranty);

    const supporting_doc_count = docs.length;
    // Typed declarations from the SupportingDocsField. Old shape was
    // {name, size, type} (file metadata, never persisted); new shape is
    // {type, label, customType?, expiresOn?}. Either way we round-trip
    // the array verbatim into supporting_docs_json so admin can see what
    // the trade claimed.
    const supporting_docs_json = docs.length ? JSON.stringify(docs) : null;
    const photo_count = photos.length;

    const web_url = websites[0] || null;
    const social_links = websites.slice(1);

    const likes_count = int(payload.likesCount, 0);
    const wins_count = int(payload.winsCount, 0);

    // Web verification. verifyWebPresence takes (url, socials, opts) and
    // returns { verified, website, socials, reasons }. The previous call
    // here referenced an undefined `company_name`, so vendorName always
    // came through as undefined - fixed.
    let web_verified = 0;
    try {
      if (web_url || social_links.length) {
        const vr = await verifyWebPresence(web_url, social_links, {
          vendorName: companyName,
        });
        web_verified = vr?.verified ? 1 : 0;
        log.info(`${TAG} web presence`, {
          verified: !!vr?.verified,
          reasons: vr?.reasons,
        });
      }
    } catch (e) {
      log.warn(`${TAG} web presence check failed`, { error: e?.message });
    }

    // CH match
    let ch_status = null;
    let company_number = null;
    let ch_name = null;
    let ch_match_score = 0;
    let ch_checked_at = null;

    try {
      if (typeof matchByName === "function") {
        const toks = extractLocationTokens?.(service_areas || "") || {};
        const hint =
          toks.full || toks.sector || toks.outward || toks.city || null;

        log.info(`${TAG} CH lookup`, { name: companyName, hint });

        const r = await Promise.resolve(
          matchByName({ name: companyName, locationHint: hint })
        );

        ch_checked_at = new Date().toISOString().slice(0, 19).replace("T", " ");

        const verdict = String(r?.verdict || "").toLowerCase();
        ch_status =
          verdict === "verified" || verdict === "exact" || verdict === "good"
            ? "verified"
            : verdict === "ambiguous"
            ? "ambiguous"
            : "none";

        if (r?.best) {
          company_number = r.best.number || null;
          ch_name = r.best.name || null;
          ch_match_score = Number(r.best.score || 0);
        }

        log.info(`${TAG} CH result`, {
          verdict,
          company_number,
          ch_status,
          ch_match_score,
        });
      }
    } catch (e) {
      log.warn(`${TAG} CH match failed`, { error: e?.message });
    }

    // lead_* id
    const leadId =
      "lead_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8);

    // ---------- write to DB ----------
    try {
      log.info(`${TAG} saving draft`, { leadId });

      // One-shot column bootstrap. See me.put.js for the matching call
      // (shared MySQL pool so either route can be the first to run on a
      // fresh install). MySQL doesn't have ALTER ... IF NOT EXISTS, so
      // we swallow the duplicate-column error.
      try {
        await mysqlQuery(
          "ALTER TABLE tradesmen ADD COLUMN supporting_docs_json TEXT NULL",
        );
      } catch (err) {
        const msg = String(err?.message || "");
        if (!/Duplicate column|already exists/i.test(msg)) {
          log.warn(`${TAG} supporting_docs_json column ensure failed`, msg);
        }
      }

      // Same bootstrap pattern for the acquisition ref column.
      try {
        await mysqlQuery(
          "ALTER TABLE tradesmen ADD COLUMN acq_ref VARCHAR(64) NULL",
        );
      } catch (err) {
        const msg = String(err?.message || "");
        if (!/Duplicate column|already exists/i.test(msg)) {
          log.warn(`${TAG} acq_ref column ensure failed`, msg);
        }
      }

      await mysqlQuery(
        `
        INSERT INTO tradesmen (
          user_id, company_name, contact_name, phone, email,
          trade_types, service_areas,
          web_verified, web_url, social_links_json,
          company_number, ch_status, ch_name, ch_checked_at, ch_match_score,
          photo_count, discount_min_percent, discount_max_percent, offers_discount,
          warranty_months, supporting_doc_count, supporting_docs_json,
          likes_count, wins_count,
          acq_ref,
          subscription_status, status, created_at, updated_at,
          public_id
        )
        VALUES (
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?,
          'draft', 'draft', NOW(), NOW(),
          UUID()
        )
        ON DUPLICATE KEY UPDATE
          public_id             = COALESCE(public_id, UUID()),
          company_name          = VALUES(company_name),
          contact_name          = VALUES(contact_name),
          phone                 = VALUES(phone),
          email                 = VALUES(email),
          trade_types           = VALUES(trade_types),
          service_areas         = VALUES(service_areas),
          web_verified          = VALUES(web_verified),
          web_url               = VALUES(web_url),
          social_links_json     = VALUES(social_links_json),
          company_number        = VALUES(company_number),
          ch_status             = VALUES(ch_status),
          ch_name               = VALUES(ch_name),
          ch_checked_at         = VALUES(ch_checked_at),
          ch_match_score        = VALUES(ch_match_score),
          photo_count           = VALUES(photo_count),
          discount_min_percent  = VALUES(discount_min_percent),
          discount_max_percent  = VALUES(discount_max_percent),
          offers_discount       = VALUES(offers_discount),
          warranty_months       = VALUES(warranty_months),
          supporting_doc_count  = VALUES(supporting_doc_count),
          supporting_docs_json  = VALUES(supporting_docs_json),
          likes_count           = VALUES(likes_count),
          wins_count            = VALUES(wins_count),
          -- acq_ref: only set if the existing row didn't already have one
          -- (preserves the first-touch attribution if the trade comes back
          -- via a different channel to refine their listing).
          acq_ref               = COALESCE(acq_ref, VALUES(acq_ref)),
          updated_at            = NOW()
        `,
        [
          leadId,
          companyName,
          payload.contactName ?? null,
          payload.phone ?? null,
          payload.email ?? null,
          trade_types,
          service_areas,
          web_verified,
          web_url,
          JSON.stringify(social_links),
          company_number,
          ch_status,
          ch_name,
          ch_checked_at,
          ch_match_score,
          photo_count,
          Math.max(0, Math.min(100, discountMin)),
          Math.max(0, Math.min(100, discountMax)),
          Math.max(discountMin, discountMax, 0),
          warranty_months,
          supporting_doc_count,
          supporting_docs_json,
          likes_count,
          wins_count,
          payload.acquisitionRef || null,
        ]
      );

      // Fire-and-forget: claim pipeline entry if this company matches
      claimPipelineEntry({
        mysqlQuery,
        uid: leadId,
        companyName,
        companyNumber: company_number || null,
        broadcastNotification: ctx.broadcastNotification,
      }).catch(() => {});

      // photos
      await mysqlQuery(
        `DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`,
        [leadId]
      );
      for (let i = 0; i < photos.length; i++) {
        await mysqlQuery(
          `
          INSERT INTO tradesmen_photos
            (tradesman_user_id, url, sort_order, created_at)
          VALUES (?, ?, ?, NOW())
        `,
          [leadId, String(photos[i]), i]
        );
      }

      // compute score
      const [row] = await mysqlQuery(
        `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
        [leadId]
      );

      if (row) {
        const s10 = computeScore10(row);
        await mysqlQuery(
          `
          UPDATE tradesmen
             SET vmb_score = ?, updated_at = NOW()
           WHERE user_id = ?
        `,
          [s10, leadId]
        );
        log.info(`${TAG} score computed`, { score: s10 });
      }

      // Fire-and-forget: enrich with Google Places data
      enrichTradesmanWithGoogle({
        mysqlQuery,
        userId: leadId,
        companyName,
        locationHint: service_areas ? String(service_areas).split(",")[0] : undefined,
        existingWebUrl: web_url || null,
        log,
      }).catch(() => {});

      res.status(201).json({
        ok: true,
        id: leadId,
        created: true,
      });
      analytics.trackTradesmanJoined(req.user?.uid, { companyName, tradeTypes: trade_types });
      ctx.logActivity("tradesman.join", "info", "guest", `New tradesman: ${companyName}`);
      return;
    } catch (e) {
      log.error(`${TAG} failed`, { error: e?.message || e });
      return res.status(500).json({ error: "Failed to save vendor draft" });
    }
  });
};
