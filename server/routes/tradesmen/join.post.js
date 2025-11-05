/**
 * POST /tradesmen/join   (no auth)
 * Saves a draft vendor (user_id = lead_*), runs CH match + web check,
 * and computes VMB score on the 0.0–10.0 scale.
 */
module.exports = (router, ctx) => {
  const { db, matchByName, extractLocationTokens } = ctx;
  const ROUTE = "/tradesmen/join";

  // Optional cheat-proof web presence verifier
  let verifyWebPresence = async () => ({ ok: false });
  try {
    verifyWebPresence =
      require("../../lib/webPresence").verifyWebPresence || verifyWebPresence;
  } catch {}

  // Helpers
  const tblCols = (name) =>
    new Set(
      db
        .prepare(`PRAGMA table_info(${name})`)
        .all()
        .map((r) => r.name)
    );
  const addColIfMissing = (tbl, def, name) => {
    const cols = tblCols(tbl);
    if (!cols.has(name))
      db.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${def}`).run();
  };
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

    const likes = int(row.likes_count, 0); // NEW
    const wins = int(row.wins_count, 0);   // NEW

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
    const winsPts = Math.min(15, wins * 3);              // 0..15 (5 wins ⇒ 15)
    const likesPts = Math.min(5, Math.floor(likes / 20)); // 0..5  (20 likes ⇒ +1)
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

  // Ensure table + columns
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS tradesmen (
      user_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT, phone TEXT, email TEXT,
      trade_types TEXT DEFAULT '', service_areas TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      subscription_status TEXT DEFAULT 'draft',
      contact_credits INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft'
    )
  `
  ).run();

  // Scoring & display columns
  addColIfMissing("tradesmen", "vmb_score REAL DEFAULT 0", "vmb_score");
  addColIfMissing(
    "tradesmen",
    "web_verified INTEGER DEFAULT 0",
    "web_verified"
  );
  addColIfMissing("tradesmen", "web_url TEXT", "web_url");
  addColIfMissing(
    "tradesmen",
    "social_links_json TEXT DEFAULT '[]'",
    "social_links_json"
  );
  addColIfMissing("tradesmen", "company_number TEXT", "company_number");
  addColIfMissing("tradesmen", "ch_status TEXT", "ch_status");
  addColIfMissing("tradesmen", "ch_name TEXT", "ch_name");
  addColIfMissing("tradesmen", "ch_checked_at TEXT", "ch_checked_at");
  addColIfMissing(
    "tradesmen",
    "ch_match_score INTEGER DEFAULT 0",
    "ch_match_score"
  );
  addColIfMissing("tradesmen", "photo_count INTEGER DEFAULT 0", "photo_count");
  // NEW: store min/max discount separately (and keep offers_discount for legacy if present)
  addColIfMissing(
    "tradesmen",
    "discount_min_percent INTEGER DEFAULT 0",
    "discount_min_percent"
  );
  addColIfMissing(
    "tradesmen",
    "discount_max_percent INTEGER DEFAULT 0",
    "discount_max_percent"
  );
  addColIfMissing(
    "tradesmen",
    "offers_discount INTEGER DEFAULT 0",
    "offers_discount"
  );
  addColIfMissing(
    "tradesmen",
    "warranty_months INTEGER DEFAULT 0",
    "warranty_months"
  );
  addColIfMissing(
    "tradesmen",
    "supporting_doc_count INTEGER DEFAULT 0",
    "supporting_doc_count"
  );
  // NEW: signals for scoring/leaderboard
  addColIfMissing("tradesmen", "likes_count INTEGER DEFAULT 0", "likes_count");
  addColIfMissing("tradesmen", "wins_count INTEGER DEFAULT 0", "wins_count");

  router.post(ROUTE, async (req, res) => {
    const b = req.body || {};
    const companyName = String(b.companyName || "").trim();
    if (!companyName)
      return res.status(400).json({ error: "companyName is required" });

    const trade_types = String(b.tradeTypes || "").trim();
    const service_areas = String(b.serviceAreas || "").trim();

    const websites = Array.isArray(b.websites)
      ? b.websites.filter(Boolean)
      : [];
    const docs = Array.isArray(b.docs) ? b.docs : [];
    const photos = Array.isArray(b.workPhotos) ? b.workPhotos : [];

    const discountMin = int(b?.offer?.discountMin, 0);
    const discountMax = int(b?.offer?.discountMax, 0);
    const warranty_months = warrantyToMonths(b?.offer?.warranty);

    const supporting_doc_count = docs.length;
    const photo_count = photos.length;

    const web_url = websites[0] || null;
    const social_links = websites.slice(1);

    // NEW: accept likes/wins (optional)
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
    } catch {}

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
        ch_checked_at = new Date().toISOString();
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
      const tx = db.transaction(() => {
        // Upsert with all signals
        db.prepare(
          `
          INSERT INTO tradesmen (
            user_id, company_name, contact_name, phone, email,
            trade_types, service_areas,
            web_verified, web_url, social_links_json,
            company_number, ch_status, ch_name, ch_checked_at, ch_match_score,
            photo_count, discount_min_percent, discount_max_percent, offers_discount,
            warranty_months, supporting_doc_count,
            likes_count, wins_count,                                   -- NEW
            subscription_status, status, updated_at
          )
          VALUES (
            @user_id, @company_name, @contact_name, @phone, @email,
            @trade_types, @service_areas,
            @web_verified, @web_url, @social_links_json,
            @company_number, @ch_status, @ch_name, @ch_checked_at, @ch_match_score,
            @photo_count, @discount_min_percent, @discount_max_percent, @offers_discount,
            @warranty_months, @supporting_doc_count,
            @likes_count, @wins_count,                                 -- NEW
            'draft', 'draft', datetime('now')
          )
          ON CONFLICT(user_id) DO UPDATE SET
            company_name=excluded.company_name,
            contact_name=excluded.contact_name,
            phone=excluded.phone,
            email=excluded.email,
            trade_types=excluded.trade_types,
            service_areas=excluded.service_areas,
            web_verified=excluded.web_verified,
            web_url=excluded.web_url,
            social_links_json=excluded.social_links_json,
            company_number=excluded.company_number,
            ch_status=excluded.ch_status,
            ch_name=excluded.ch_name,
            ch_checked_at=excluded.ch_checked_at,
            ch_match_score=excluded.ch_match_score,
            photo_count=excluded.photo_count,
            discount_min_percent=excluded.discount_min_percent,
            discount_max_percent=excluded.discount_max_percent,
            offers_discount=excluded.offers_discount,
            warranty_months=excluded.warranty_months,
            supporting_doc_count=excluded.supporting_doc_count,
            likes_count=excluded.likes_count,                           -- NEW
            wins_count=excluded.wins_count,                             -- NEW
            subscription_status='draft',
            status='draft',
            updated_at=datetime('now')
        `
        ).run({
          user_id: leadId,
          company_name: companyName,
          contact_name: b.contactName ?? null,
          phone: b.phone ?? null,
          email: b.email ?? null,
          trade_types,
          service_areas,
          web_verified,
          web_url,
          social_links_json: JSON.stringify(social_links),
          company_number,
          ch_status,
          ch_name,
          ch_checked_at,
          ch_match_score,
          photo_count,
          discount_min_percent: Math.max(0, Math.min(100, discountMin)),
          discount_max_percent: Math.max(0, Math.min(100, discountMax)),
          offers_discount: Math.max(discountMin, discountMax, 0), // legacy single field
          warranty_months,
          supporting_doc_count,
          likes_count,
          wins_count,
        });

        // Compute & persist VMB score (0.0–10.0)
        const row = db
          .prepare(`SELECT * FROM tradesmen WHERE user_id=?`)
          .get(leadId);
        const s10 = computeScore10(row);
        db.prepare(
          `UPDATE tradesmen SET vmb_score=?, updated_at=datetime('now') WHERE user_id=?`
        ).run(s10, leadId);
      });

      tx();

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
