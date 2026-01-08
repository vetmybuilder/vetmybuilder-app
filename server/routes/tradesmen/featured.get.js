// server/routes/tradesmen/featured.get.js

/**
 * GET /api/tradesmen/featured
 * Auth: required
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/featured.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  log.info?.(`${TAG} mounted`);

  // ---------------- Budget helpers ----------------
  const NUM_KEYS_UPPER = [
    "budget_max",
    "maxBudget",
    "budgetMax",
    "expected_max",
    "expectedMax",
    "price_max",
    "priceMax",
    "estimated_budget_max",
    "estimatedBudgetMax",
    "estimatedBudgetUpper",
    "totalBudget",
    "value",
    "expectedCost",
    "expected_cost",
  ];

  const NUM_KEYS_LOWER = [
    "budget_min",
    "minBudget",
    "budgetMin",
    "price_min",
    "priceMin",
    "estimated_budget_min",
    "estimatedBudgetMin",
    "estimatedBudgetLower",
    "budget",
  ];

  const parseMoneyUpperFromText = (text) => {
    if (!text || typeof text !== "string") return 0;
    let scope = text;
    const idx = text.toLowerCase().indexOf("budget");
    if (idx !== -1) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + 120);
      scope = text.slice(start, end);
    }
    scope = scope.replace(/–|—/g, "-").replace(/\bto\b/gi, "-");

    const re =
      /£?\s*([0-9]{1,3}(?:,[0-9]{3})*|\d+(?:\.\d+)?)\s*(k|m)?\s*(\+)?/gi;
    let m;
    const vals = [];
    while ((m = re.exec(scope)) !== null) {
      const num = parseFloat(m[1].replace(/,/g, ""));
      const unit = (m[2] || "").toLowerCase();
      let v = num;
      if (unit === "k") v *= 1000;
      if (unit === "m") v *= 1000000;
      if (Number.isFinite(v)) vals.push(v);
    }
    return vals.length ? Math.max(...vals) : 0;
  };

  const getProjectUpperBudget = async (projectId) => {
    if (!projectId) return 0;
    try {
      const rows = await mysqlQuery(
        `SELECT * FROM projects WHERE id=? LIMIT 1`,
        [projectId]
      );
      const row = rows[0];
      if (!row) return 0;

      const pickNum = (keys) => {
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(row, k)) {
            const v = Number(row[k]);
            if (Number.isFinite(v) && v > 0) return v;
          }
        }
        return null;
      };

      const explicitUpper = pickNum(NUM_KEYS_UPPER);
      const explicitLower = pickNum(NUM_KEYS_LOWER);
      if (explicitUpper) return explicitUpper;
      if (explicitLower) return explicitLower;

      const text =
        row.description ||
        row.details ||
        row.desc ||
        row.summary ||
        row.notes ||
        "";
      return parseMoneyUpperFromText(text);
    } catch (e) {
      log.warn?.(`${TAG} getProjectUpperBudget failed`, { error: e?.message });
      return 0;
    }
  };

  // ---------------- Type keyword ----------------
  const getProjectTypeKeyword = async (projectId) => {
    if (!projectId) return null;
    try {
      const rows = await mysqlQuery(
        `SELECT id, name, type FROM projects WHERE id=? LIMIT 1`,
        [projectId]
      );
      const row = rows[0];
      if (!row) return null;
      const raw = row.type || row.name || "";
      return raw ? raw.toLowerCase().trim() : null;
    } catch (e) {
      log.warn?.(`${TAG} getProjectTypeKeyword failed`, { error: e?.message });
      return null;
    }
  };

  // ---------------- Matching helpers ----------------
  const normalise = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const hasTradeMatch = (tradeTypes, projectTypeLower) => {
    if (!tradeTypes || !projectTypeLower) return false;
    const kw = normalise(projectTypeLower);
    const parts = String(tradeTypes)
      .split(/[,|]/)
      .map(normalise)
      .filter(Boolean);
    return parts.some((p) => p === kw || p.includes(kw) || kw.includes(p));
  };

  // ---------------- Tier helpers ----------------
  const tierRank = (tier) => {
    const t = String(tier || "").toLowerCase();
    if (t === "spotlight") return 0;
    if (t === "gold") return 1;
    if (t === "unlock") return 2;
    return 3;
  };

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

  const isChVerified = (row) =>
    String(row.ch_status || "").toLowerCase() === "verified";

  const firstServiceArea = (serviceAreas) => {
    if (!serviceAreas) return null;
    try {
      const parsed = JSON.parse(serviceAreas);
      if (Array.isArray(parsed) && parsed.length) return String(parsed[0]);
    } catch {}
    const first = String(serviceAreas)
      .split(/[,\s]+/)
      .filter(Boolean)[0];
    return first || null;
  };

  const parseSocials = (json) => {
    if (!json) return [];
    try {
      const v = JSON.parse(json);
      if (Array.isArray(v)) return v.filter(Boolean).map(String);
      if (v && typeof v === "object")
        return Object.values(v).filter(Boolean).map(String);
    } catch {}
    return [];
  };

  const HARD_STARS = 4.8;

  const makePlaceholders = (seed) => [
    `https://placehold.co/400x300?text=Project+${encodeURIComponent(seed)}+1`,
    `https://placehold.co/400x300?text=Project+${encodeURIComponent(seed)}+2`,
    `https://placehold.co/400x300?text=Project+${encodeURIComponent(seed)}+3`,
  ];

  const getActiveSpotlightUserIds = async () => {
    try {
      const rows = await mysqlQuery(
        `
        SELECT DISTINCT user_id
          FROM payments_oneoff
         WHERE LOWER(COALESCE(type,''))='spotlight'
           AND LOWER(COALESCE(status,''))='active'
           AND (expires_at IS NULL OR expires_at > NOW())
        `
      );
      return new Set(rows.map((r) => String(r.user_id)));
    } catch (e) {
      log.warn?.(`${TAG} getActiveSpotlightUserIds failed`, {
        error: e?.message,
      });
      return new Set();
    }
  };

  // ---------------- Photo table ----------------
  const resolvePhotoTable = async () => {
    if (ctx._vmbPhotoTableResolved) return ctx._vmbPhotoTableResolved;
    try {
      const rows = await mysqlQuery(
        `
        SELECT TABLE_NAME
          FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME IN ('tradesmen_photos','tradesman_photos')
         LIMIT 1
        `
      );
      ctx._vmbPhotoTableResolved = rows[0]?.TABLE_NAME || null;
    } catch (e) {
      log.warn?.(`${TAG} resolvePhotoTable failed`, { error: e?.message });
      ctx._vmbPhotoTableResolved = null;
    }
    return ctx._vmbPhotoTableResolved;
  };

  const loadPhotosByUser = async (userIds) => {
    const map = new Map();
    const table = await resolvePhotoTable();
    if (!table) return map;

    // ⭐ FIX: avoid SQL error when IN () is empty
    if (!userIds || userIds.length === 0) {
      return map; // nothing to load
    }

    try {
      const placeholders = userIds.map(() => "?").join(",");
      const rows = await mysqlQuery(
        `
      SELECT tradesman_user_id, url
      FROM ${table}
      WHERE tradesman_user_id IN (${placeholders})
      ORDER BY tradesman_user_id, COALESCE(sort_order,999999), created_at
      `,
        userIds
      );

      for (const r of rows) {
        const uid = String(r.tradesman_user_id);
        if (!map.has(uid)) map.set(uid, []);
        map.get(uid).push(r.url);
      }
    } catch (e) {
      log.warn?.(`${TAG} loadPhotosByUser failed`, { error: e?.message });
    }

    return map;
  };

  // ---------------- Route handler ----------------
  router.get("/tradesmen/featured", auth, async (req, res) => {
    log.info?.(`${TAG} request`, { query: req.query });

    try {
      const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query.limit ?? "24", 10))
      );
      const goldFirst =
        String(req.query.goldFirst ?? "true").toLowerCase() !== "false";
      const onlyGold =
        String(req.query.onlyGold ?? "false").toLowerCase() === "true";
      const projectId = req.query.projectId
        ? Number(req.query.projectId)
        : null;

      const projectTypeKeyword = projectId
        ? await getProjectTypeKeyword(projectId)
        : null;

      const projectKwLc = projectTypeKeyword || null;

      const projectUpper = projectId
        ? await getProjectUpperBudget(projectId)
        : 0;

      const spotlightActive = await getActiveSpotlightUserIds();
      const spotlightApplies = projectUpper >= 15000;

      let rows;
      try {
        rows = await mysqlQuery(
          `
          SELECT *
            FROM tradesmen
           WHERE COALESCE(status,'active') != 'banned'
        `
        );
      } catch (e) {
        log.error?.(`${TAG} tradesmen SELECT failed`, { error: e?.message });
        return res.status(500).json({ error: "FEATURED_TRADESMEN_FAILED" });
      }

      const ids = rows.map((r) => String(r.user_id));
      const photos = await loadPhotosByUser(ids);

      const shaped = rows
        .map((r) => {
          const tier = normaliseTier(r);
          const uid = String(r.user_id);

          if (spotlightActive.has(uid)) return null;
          if (onlyGold && tier !== "gold") return null;

          const photoUrls = photos.get(uid) || [];
          const avatarUrl = photoUrls[0] || null;

          const matchesProjectType = hasTradeMatch(r.trade_types, projectKwLc);

          return {
            builderId: uid,
            companyName: r.company_name,
            displayName: r.company_name || r.contact_name || "Tradesman",
            tier,
            purchasedPlan: r.purchased_plan || r.plan,
            badges: {
              companiesHouseVerified: isChVerified(r),
              insuranceValid: false,
            },
            avatarUrl,
            gallery:
              photoUrls.length > 0
                ? photoUrls.slice(0, 3)
                : makePlaceholders(uid),
            stats: {
              completed: Number(r.wins_count || 0),
              photos: Number(r.photo_count || photoUrls.length || 0),
              reviews: Number(r.likes_count || 0),
              stars: HARD_STARS,
            },
            score: Number(r.vmb_score || 0),

            // ❌ OLD: leaked service area outward postcodes
            // location: { outward: firstServiceArea(r.service_areas) },

            // ✅ NEW: remove location entirely (Option A)
            location: null,

            phone: r.phone || null,
            email: r.email || null,
            website: r.web_url || null,
            socials: parseSocials(r.social_links_json),
            companyNumber: r.company_number || null,
            badge: r.vmb_badge || null,
            offersDiscount: !!r.offers_discount,
            warrantyMonths: r.warranty_months || 0,
            matchesProjectType,
          };
        })
        .filter(Boolean);
      shaped.sort((a, b) => {
        if (projectKwLc) {
          if (a.matchesProjectType !== b.matchesProjectType)
            return b.matchesProjectType - a.matchesProjectType;
        }
        if (goldFirst) {
          const t = tierRank(a.tier) - tierRank(b.tier);
          if (t !== 0) return t;
        }
        const s = (b.score || 0) - (a.score || 0);
        if (s !== 0) return s;

        return (a.companyName || "").localeCompare(b.companyName || "");
      });

      const total = shaped.length;
      const start = (page - 1) * limit;
      const items = shaped.slice(start, start + limit);

      log.info?.(`${TAG} success`, { total, returned: items.length });

      return res.json({
        items,
        total,
        page,
        limit,
        projectBudgetUpper: projectUpper || undefined,
        spotlightExcluded: spotlightApplies ? spotlightActive.size : 0,
      });
    } catch (err) {
      log.error?.(`${TAG} handler error`, { error: err?.message });
      return res.status(500).json({
        error: "FEATURED_TRADESMEN_FAILED",
        message: err?.message,
      });
    }
  });
};
