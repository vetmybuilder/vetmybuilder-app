// server/routes/tradesmen/tradesman.get.js
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/tradesman.get]";
  const { normaliseScore } = require("../../lib/recommendationScoring");
  const ROUTE = "/tradesmen/:publicId";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  /* ---------- helpers ---------- */

  const tableExists = async (name) => {
    const safe = String(name || "").replace(/`/g, "");
    const sql = `SHOW TABLES LIKE '${safe}'`;

    try {
      const rows = await mysqlQuery(sql, []);
      return Array.isArray(rows) && rows.length > 0;
    } catch (e) {
      log.warn(`${TAG} tableExists failed`, {
        table: name,
        error: e?.message || e,
      });
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
    } catch (_) {}
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
    } catch (_) {}
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
      log.warn(`${TAG} resolvePhotoTable failed`, { error: e?.message || e });
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
      log.warn(`${TAG} loadPhotoUrlsFor failed`, {
        uid,
        error: e?.message || e,
      });
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
      log.warn(`${TAG} favourite lookup failed`, {
        viewerId,
        builderId,
        error: e?.message || e,
      });
      return 0;
    }
  };

  /* ---------- route ---------- */

  router.get(ROUTE, auth, async (req, res) => {
    const publicId = String(req.params.publicId || "").trim();
    log.info(`${TAG} hit`, { publicId });

    try {
      const hasTradesmen = await tableExists("tradesmen");
      if (!hasTradesmen) {
        log.error(`${TAG} missing tradesmen table`);
        return res.status(500).json({ error: "NO_TRADESMEN_TABLE" });
      }

      if (!publicId) {
        log.warn(`${TAG} missing publicId param`);
        return res.status(400).json({ error: "MISSING_ID" });
      }

      /* 1) Load tradesman row — try public_id first, fall back to user_id.
            If the public_id column doesn't exist yet (pre-migration prod DB),
            fall back to user_id-only lookup. */
      let rows;
      try {
        rows = await mysqlQuery(
          `SELECT * FROM tradesmen WHERE public_id = ? OR user_id = ? LIMIT 1`,
          [publicId, publicId]
        );
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("public_id")) {
          // Column not yet in DB — fall back to user_id only
          log.warn(`${TAG} public_id column missing, falling back to user_id lookup`);
          try {
            rows = await mysqlQuery(
              `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
              [publicId]
            );
          } catch (e2) {
            log.error(`${TAG} SELECT error (fallback)`, { error: e2?.message || e2 });
            return res.status(500).json({ error: "FAILED", stage: "select_tradesman" });
          }
        } else {
          log.error(`${TAG} SELECT error`, { stage: "select_tradesman", error: msg });
          return res.status(500).json({ error: "FAILED", stage: "select_tradesman", message: msg });
        }
      }

      const row = rows?.[0];
      if (!row || String(row.status || "").toLowerCase() === "banned") {
        log.warn(`${TAG} tradesman not found or banned`, { publicId });
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      const uid = row.user_id;

      /* 2) Photos */
      const photoUrls = await loadPhotoUrlsFor(uid);
      const gallery = photoUrls.length ? photoUrls : makePlaceholders(uid);
      const savedPicUrl = row.profile_picture_url || null;
      const avatarUrl =
        savedPicUrl && photoUrls.includes(savedPicUrl)
          ? savedPicUrl
          : photoUrls[0] || null;

      /* 3) Service areas */
      const serviceAreas = parseServiceAreas(row.service_areas);
      const outward = serviceAreas[0] || null;

      /* 4) Favourite flag */
      const viewerId = req.user?.uid;
      const isFavourite = await isFavouriteForViewer(viewerId, uid);

      /* 5) Google review metadata */
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
        publicId: row.public_id,
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
          reviews:
            googleReviewsCount && Number.isFinite(googleReviewsCount)
              ? googleReviewsCount
              : Number(row.likes_count || 0),
          stars:
            googleRating !== null && Number.isFinite(googleRating)
              ? googleRating
              : null,
        },

        score: normaliseScore(Number(row.vmb_score ?? 0)),
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
        profilePictureUrl: row.profile_picture_url || null,

        googlePlaceId,
        googleRating,
        googleReviewsCount,
      };

      log.info(`${TAG} success`, {
        uid,
        tier,
        galleryCount: gallery.length,
        googleRating,
        googleReviewsCount,
      });

      return res.json({ item: payload });
    } catch (e) {
      log.error(`${TAG} unhandled error`, { error: e?.message || e });
      return res.status(500).json({
        error: "FAILED",
        stage: "outer",
        message: String(e?.message || e),
      });
    }
  });

  if (!ctx.__logged_tradesman_get) {
    ctx.__logged_tradesman_get = true;
    log.info(`[routes] mounted: GET ${ROUTE}`);
  }
};
