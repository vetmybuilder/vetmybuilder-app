// server/routes/tradesmen/tradesman.get.js
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  /* ---------- helpers ---------- */

  const tableExists = async (name) => {
    // mysql2 prepared statements don't support ? in SHOW TABLES,
    // so we have to inline the value (it's internal, not user input).
    const safe = String(name || "").replace(/`/g, "");
    const sql = `SHOW TABLES LIKE '${safe}'`;
    try {
      const rows = await mysqlQuery(sql, []); // no params
      return Array.isArray(rows) && rows.length > 0;
    } catch (e) {
      console.error("[/tradesmen/:uid] tableExists error:", e);
      return false;
    }
  };
  const isChVerified = (row) =>
    String(row?.ch_status || "").toLowerCase() === "verified";

  const parseSocials = (json) => {
    if (!json) return [];
    try {
      const v = JSON.parse(json);
      if (Array.isArray(v)) return v.filter(Boolean).map(String);
      if (v && typeof v === "object") {
        return Object.values(v).filter(Boolean).map(String);
      }
    } catch {
      // ignore
    }
    return [];
  };

  const normaliseTier = (row) => {
    const raw =
      (row?.plan || row?.purchased_plan || row?.subscription_status || "free") +
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

  // Detect which photo table exists (once per process)
  const resolvePhotoTable = async () => {
    if (ctx._vmbPhotoTableResolved) return ctx._vmbPhotoTableResolved;
    try {
      const rows = await mysqlQuery(
        `
        SELECT TABLE_NAME
          FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME IN ('tradesmen_photos', 'tradesman_photos')
         LIMIT 1
        `
      );
      ctx._vmbPhotoTableResolved = rows?.[0]?.TABLE_NAME || null;
    } catch (e) {
      console.warn(
        "[/tradesmen/:uid] resolvePhotoTable failed:",
        e?.message || e
      );
      ctx._vmbPhotoTableResolved = null;
    }
    return ctx._vmbPhotoTableResolved;
  };

  const loadPhotoUrlsFor = async (uid) => {
    const table = await resolvePhotoTable();
    if (!table) return [];
    try {
      const rows = await mysqlQuery(
        `
        SELECT url, sort_order, created_at
          FROM ${table}
         WHERE tradesman_user_id = ?
         ORDER BY COALESCE(sort_order, 999999) ASC, created_at ASC
        `,
        [uid]
      );
      return (rows || []).map((p) => makeAbsolute(p.url));
    } catch (e) {
      console.warn(
        "[/tradesmen/:uid] loadPhotoUrlsFor failed:",
        e?.message || e
      );
      return [];
    }
  };

  const isFavouriteForViewer = async (viewerId, builderId) => {
    if (!viewerId) return 0;
    const hasFav = await tableExists("favourite_tradesmen");
    if (!hasFav) return 0;
    try {
      const rows = await mysqlQuery(
        `
        SELECT 1
          FROM favourite_tradesmen
         WHERE userId = ?
           AND builderId = ?
         LIMIT 1
        `,
        [viewerId, builderId]
      );
      return rows.length ? 1 : 0;
    } catch (e) {
      console.warn(
        "[/tradesmen/:uid] favourite lookup failed:",
        e?.message || e
      );
      return 0;
    }
  };

  /* ---------- route ---------- */

  router.get("/tradesmen/:uid", auth, async (req, res) => {
    try {
      const hasTradesmen = await tableExists("tradesmen");
      if (!hasTradesmen) {
        return res.status(500).json({ error: "NO_TRADESMEN_TABLE" });
      }

      const uid = String(req.params.uid || "").trim();
      if (!uid) return res.status(400).json({ error: "MISSING_UID" });

      // 1) Load tradesman row – SELECT * so we never break on column names
      let rows;
      try {
        rows = await mysqlQuery(
          `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
          [uid]
        );
      } catch (e) {
        console.error("[/tradesmen/:uid] SELECT error:", e);
        return res.status(500).json({
          error: "FAILED",
          stage: "select_tradesman",
          message: String(e?.message || e),
        });
      }

      const row = rows && rows[0];
      if (!row || String(row.status || "").toLowerCase() === "banned") {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      // 2) Photos
      const photoUrls = await loadPhotoUrlsFor(uid);
      const gallery = photoUrls.length ? photoUrls : makePlaceholders(uid);
      const avatarUrl = photoUrls.length ? photoUrls[0] : null;

      // 3) Service areas / outward code
      const serviceAreas = parseServiceAreas(row.service_areas);
      const outward = serviceAreas[0] || null;

      // 4) Favourite flag
      const viewerId = req.user && req.user.uid;
      const isFavourite = await isFavouriteForViewer(viewerId, uid);

      // 5) Google review fields (may or may not exist in this schema)
      const googlePlaceId = row.google_place_id || null;
      const googleRating =
        row.google_rating === null || row.google_rating === undefined
          ? null
          : Number(row.google_rating);
      const googleReviewsCount =
        row.google_reviews_count === null ||
        row.google_reviews_count === undefined
          ? 0
          : Number(row.google_reviews_count);

      const tier = normaliseTier(row);

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
          // Prefer Google review count if available, else likes_count
          reviews:
            googleReviewsCount && Number.isFinite(googleReviewsCount)
              ? googleReviewsCount
              : Number(row.likes_count || 0),
          // Prefer Google rating if available, else legacy 4.8
          stars:
            googleRating !== null && Number.isFinite(googleRating)
              ? googleRating
              : 4.8,
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
        isFavourite,

        // expose Google pieces to the front-end (for GoogleRatingChip)
        googlePlaceId,
        googleRating,
        googleReviewsCount,
      };

      return res.json({ item: payload });
    } catch (e) {
      console.error("[/tradesmen/:uid] UNHANDLED ERROR:", e);
      return res.status(500).json({
        error: "FAILED",
        stage: "outer",
        message: String(e?.message || e),
      });
    }
  });

  if (!ctx.__logged_tradesman_get) {
    ctx.__logged_tradesman_get = true;
    console.log("[routes] mounted: GET /api/tradesmen/:uid");
  }
};
