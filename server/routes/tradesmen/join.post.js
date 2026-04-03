// server/routes/tradesmen/join.post.js

/**
 * POST /tradesmen/join   (no auth)
 * Saves a draft vendor (user_id = lead_*), runs CH match + web check,
 * and computes VMB score on the 0.0–10.0 scale.
 */
module.exports = (router, ctx) => {
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

  /** Compute VMB score 0–10.0 (1dp) */
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
  router.post(ROUTE, async (req, res) => {
    const b = req.body || {};
    const companyName = String(b.companyName || "").trim();

    log.info(`${TAG} hit`, {
      companyName,
      tradeTypes: b.tradeTypes,
      serviceAreas: b.serviceAreas,
    });

    if (!companyName) {
      log.warn(`${TAG} missing companyName`);
      return res.status(400).json({ error: "companyName is required" });
    }

    const trade_types = String(b.tradeTypes || "").trim();
    const service_areas = String(b.serviceAreas || "").trim();

    const websites = Array.isArray(b.websites)
      ? b.websites.filter(Boolean)
      : [];
    const docs = Array.isArray(b.docs) ? b.docs : [];
    const photos = Array.isArray(b.workPhotos)
      ? b.workPhotos.filter(Boolean)
      : [];

    const discountMin = int(b?.offer?.discountMin, 0);
    const discountMax = int(b?.offer?.discountMax, 0);
    const warranty_months = warrantyToMonths(b?.offer?.warranty);

    const supporting_doc_count = docs.length;
    const photo_count = photos.length;

    const web_url = websites[0] || null;
    const social_links = websites.slice(1);

    const likes_count = int(b.likesCount, 0);
    const wins_count = int(b.winsCount, 0);

    // Web verification
    let web_verified = 0;
    try {
      if (web_url || social_links.length) {
        const vr = await verifyWebPresence({
          website: web_url,
          socials: social_links,
        });
        web_verified = vr?.ok ? 1 : 0;
        log.info(`${TAG} web presence`, { ok: !!vr?.ok });
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

      await mysqlQuery(
        `
        INSERT INTO tradesmen (
          user_id, company_name, contact_name, phone, email,
          trade_types, service_areas,
          web_verified, web_url, social_links_json,
          company_number, ch_status, ch_name, ch_checked_at, ch_match_score,
          photo_count, discount_min_percent, discount_max_percent, offers_discount,
          warranty_months, supporting_doc_count,
          likes_count, wins_count,
          subscription_status, status, created_at, updated_at,
          public_id
        )
        VALUES (
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?,
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
          likes_count           = VALUES(likes_count),
          wins_count            = VALUES(wins_count),
          updated_at            = NOW()
        `,
        [
          leadId,
          companyName,
          b.contactName ?? null,
          b.phone ?? null,
          b.email ?? null,
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
          likes_count,
          wins_count,
        ]
      );

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

      return res.status(201).json({
        ok: true,
        id: leadId,
        created: true,
      });
    } catch (e) {
      log.error(`${TAG} failed`, { error: e?.message || e });
      return res.status(500).json({ error: "Failed to save vendor draft" });
    }
  });
};
