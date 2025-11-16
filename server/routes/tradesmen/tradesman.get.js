// server/routes/tradesmen/tradesman.get.js
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  const hasTable = (name) =>
    !!db
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`
      )
      .get(name);

  const isChVerified = (row) =>
    String(row.ch_status || "").toLowerCase() === "verified";

  const parseSocials = (json) => {
    if (!json) return [];
    try {
      const v = JSON.parse(json);
      if (Array.isArray(v)) return v.filter(Boolean).map(String);
      if (v && typeof v === "object") {
        return Object.values(v).filter(Boolean).map(String);
      }
    } catch {}
    return [];
  };

  // normalise subscription/plan into a simple tier string
  const normaliseTier = (row) => {
    const raw =
      (row.plan || row.purchased_plan || row.subscription_status || "free") +
      "";
    const t = raw.toLowerCase();
    if (["spotlight", "gold", "unlock", "free"].includes(t)) return t;
    if (t.includes("spot")) return "spotlight";
    if (t.includes("gold")) return "gold";
    if (t.includes("unlock")) return "unlock";
    return "free";
  };

  const parseServiceAreas = (serviceAreas) => {
    if (!serviceAreas) return [];
    try {
      const parsed = JSON.parse(serviceAreas);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(Boolean)
          .map((v) => String(v).trim())
          .filter(Boolean);
      }
      if (parsed && typeof parsed === "object") {
        return Object.values(parsed)
          .filter(Boolean)
          .map((v) => String(v).trim())
          .filter(Boolean);
      }
    } catch {
      // fall back to plain string parsing
    }
    return String(serviceAreas)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const makePlaceholders = (seed) => [
    `https://placehold.co/800x600?text=Project+${encodeURIComponent(seed)}+1`,
    `https://placehold.co/800x600?text=Project+${encodeURIComponent(seed)}+2`,
    `https://placehold.co/800x600?text=Project+${encodeURIComponent(seed)}+3`,
  ];

  const makeAbsolute = (path) => {
    if (!path) return null;
    const s = String(path);
    if (/^https?:\/\//i.test(s)) return s;
    const base =
      process.env.MEDIA_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "";
    if (!base) return s.startsWith("/") ? s : `/${s}`;
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const cleanPath = s.startsWith("/") ? s : `/${s}`;
    return `${cleanBase}${cleanPath}`;
  };

  router.get("/tradesmen/:uid", auth, (req, res) => {
    try {
      if (!hasTable("tradesmen")) {
        return res.status(500).json({ error: "NO_TRADESMEN_TABLE" });
      }

      const uid = String(req.params.uid || "").trim();
      if (!uid) return res.status(400).json({ error: "MISSING_UID" });

      const row = db
        .prepare(
          `
          SELECT
            user_id,
            company_name,
            contact_name,
            phone,
            email,
            trade_types,
            service_areas,
            created_at,
            updated_at,
            subscription_status,
            company_number,
            ch_status,
            ch_name,
            vmb_score,
            likes_count,
            wins_count,
            web_url,
            social_links_json,
            vmb_badge,
            offers_discount,
            warranty_months,
            photo_count,
            status,
            plan,
            purchased_plan
          FROM tradesmen
          WHERE user_id = ?
          LIMIT 1
        `
        )
        .get(uid);

      if (!row || String(row.status || "").toLowerCase() === "banned") {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      const PHOTO_TABLE = hasTable("tradesman_photos")
        ? "tradesman_photos"
        : hasTable("tradesmen_photos")
        ? "tradesmen_photos"
        : null;

      let photoUrls = [];
      if (PHOTO_TABLE) {
        const photos = db
          .prepare(
            `
            SELECT url, sort_order, created_at
              FROM ${PHOTO_TABLE}
             WHERE tradesman_user_id = ?
             ORDER BY COALESCE(sort_order, 999999) ASC, created_at ASC
          `
          )
          .all(uid);
        photoUrls = photos.map((p) => makeAbsolute(p.url));
      }

      const serviceAreas = parseServiceAreas(row.service_areas);
      const outward = serviceAreas[0] || null;
      const gallery = photoUrls.length ? photoUrls : makePlaceholders(uid);
      const avatarUrl = photoUrls.length ? photoUrls[0] : null;
      const tier = normaliseTier(row);

      // --- favourite state for current viewer ---
      let isFavourite = 0;
      const viewerId = req.user && req.user.uid;
      const hasFavTable = hasTable("favourite_tradesmen");

      if (viewerId && hasFavTable) {
        try {
          const fav = db
            .prepare(
              `SELECT 1
                 FROM favourite_tradesmen
                WHERE userId = ? AND builderId = ?
                LIMIT 1`
            )
            .get(viewerId, uid);
          if (fav) isFavourite = 1;
        } catch (e) {
          console.warn(
            "[/tradesmen/:uid] favourite lookup failed",
            e?.message || e
          );
        }
      }

      const payload = {
        builderId: uid,
        companyName: row.company_name || null,
        displayName: row.company_name || row.contact_name || "Tradesman",
        badges: {
          companiesHouseVerified: isChVerified(row),
          insuranceValid: false,
        },
        tier,
        serviceAreas,
        avatarUrl,
        gallery,
        stats: {
          completed: Number(row.wins_count || 0),
          photos: Number(row.photo_count || photoUrls.length || 0),
          reviews: Number(row.likes_count || 0),
          stars: 4.8,
        },
        score: Number(row.vmb_score ?? 0),
        location: { outward },
        phone: row.phone || null,
        email: row.email || null,
        website: row.web_url || null,
        socials: parseSocials(row.social_links_json),
        companyNumber: row.company_number || null,
        badge: row.vmb_badge || null,
        offersDiscount: !!row.offers_discount,
        warrantyMonths: row.warranty_months || 0,
        tradeTypes: row.trade_types || null,
        createdAt: row.created_at || null,
        isFavourite, // <--- new flag for UI
      };

      return res.json({ item: payload });
    } catch (e) {
      console.error("[/tradesmen/:uid] error", e);
      return res.status(500).json({
        error: "FAILED",
        message: e?.message || String(e),
      });
    }
  });

  if (!ctx.__logged_tradesman_get) {
    ctx.__logged_tradesman_get = true;
    console.log("[routes] mounted: GET /api/tradesmen/:uid");
  }
};
