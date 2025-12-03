// server/routes/tradesmen/join.post.js

/**
 * POST /tradesmen/join   (no auth)
 * Saves a draft vendor (user_id = lead_*), runs CH match + web check,
 * and computes VMB score on the 0.0–10.0 scale.
 */
module.exports = (router, ctx) => {
  const { mysqlQuery, matchByName, extractLocationTokens } = ctx;
  const ROUTE = "/tradesmen/join";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  // Optional cheat-proof web presence verifier
  let verifyWebPresence = async () => ({ ok: false });
  try {
    verifyWebPresence =
      require("../../lib/webPresence").verifyWebPresence || verifyWebPresence;
  } catch {
    // ignore – web presence is best-effort
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

  // Compute 0..100 then expose as 0.0..10.0 (1dp)
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

    // NEW: signals
    const winsPts = Math.min(15, wins * 3); // 0..15 (5 wins ⇒ 15)
    const likesPts = Math.min(5, Math.floor(likes / 20)); // 0..5 (20 likes ⇒ +1)
    s100 += winsPts + likesPts;

    s100 = Math.max(0, Math.min(100, s100));
    const s10 = Math.round((s100 / 10) * 10) / 10; // 0.0 – 10.0 (1dp)
    return s10;
  }

  if (!ctx.__mounted_join_post) {
    ctx.__mounted_join_post = true;
    const base = ctx.API_PREFIX || "/api";
    console.log(`[routes] mounted: POST ${base}${ROUTE}`);
  }

  // ---------- route ----------
  router.post(ROUTE, async (req, res) => {
    const b = req.body || {};
    const companyName = String(b.companyName || "").trim();
    if (!companyName) {
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

    // optional signals from UI
    const likes_count = int(b.likesCount, 0);
    const wins_count = int(b.winsCount, 0);

    // Web verification (best-effort)
    let web_verified = 0;
    try {
      if (web_url || social_links.length) {
        const vr = await verifyWebPresence({
          website: web_url,
          socials: social_links,
        });
        web_verified = vr?.ok ? 1 : 0;
      }
    } catch {
      // ignore web presence failure
    }

    // Companies House name match
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
        const r = await Promise.resolve(
          matchByName({ name: companyName, locationHint: hint })
        );

        // MySQL-friendly datetime: "YYYY-MM-DD HH:MM:SS"
        const now = new Date();
        ch_checked_at = now.toISOString().slice(0, 19).replace("T", " ");

        const v = String(r?.verdict || "").toLowerCase();
        ch_status =
          v === "verified" || v === "exact" || v === "good"
            ? "verified"
            : v === "ambiguous"
            ? "ambiguous"
            : "none";
        if (r?.best) {
          company_number = r.best.number || null;
          ch_name = r.best.name || null;
          ch_match_score = Number(r.best.score || 0);
        }
      }
    } catch (e) {
      console.warn("[join] CH match failed:", e?.message || e);
    }

    // lead_* id for draft vendors
    const leadId =
      "lead_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8);

    try {
      // ---------- UPSERT tradesmen (MySQL) ----------
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
          subscription_status, status, created_at, updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          'draft', 'draft', NOW(), NOW()
        )
        ON DUPLICATE KEY UPDATE
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
          subscription_status   = 'draft',
          status                = 'draft',
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

      // ---------- sync tradesmen_photos (MySQL) ----------
      await mysqlQuery(
        `DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`,
        [leadId]
      );

      if (photos.length > 0) {
        for (let idx = 0; idx < photos.length; idx++) {
          const url = photos[idx];
          if (!url) continue;
          await mysqlQuery(
            `
            INSERT INTO tradesmen_photos
              (tradesman_user_id, url, sort_order, created_at)
            VALUES (?, ?, ?, NOW())
            `,
            [leadId, String(url), idx]
          );
        }
      }

      // ---------- compute & persist vmb_score (0.0–10.0) ----------
      const rows = await mysqlQuery(
        `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
        [leadId]
      );
      const row = rows[0] || null;

      if (row) {
        const s10 = computeScore10(row);
        await mysqlQuery(
          `UPDATE tradesmen SET vmb_score = ?, updated_at = NOW() WHERE user_id = ?`,
          [s10, leadId]
        );
      }

      return res.status(201).json({
        ok: true,
        id: leadId,
        created: true,
      });
    } catch (e) {
      console.error("[join] 500 failure", e);
      return res.status(500).json({ error: "Failed to save vendor draft" });
    }
  });
};
