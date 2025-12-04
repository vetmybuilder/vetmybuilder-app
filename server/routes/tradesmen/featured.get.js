// server/routes/tradesmen/featured.get.js

/**
 * GET /api/tradesmen/featured
 * Auth: required
 *
 * Query:
 *   projectId?=123                // used to tailor to project.type + decide Spotlight applicability (>= £15k)
 *   goldFirst=true|false          // default true
 *   onlyGold=true|false           // default false
 *   page?=1
 *   limit?=24 (max 50)
 *
 * Data source: tradesmen table (+ payments_oneoff only to exclude Spotlight-active)
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  // -------- Budget helpers (same logic as spotlight route; NO hard-coded columns) --------
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
      let n = m[1].replace(/,/g, "");
      let v = parseFloat(n);
      const unit = (m[2] || "").toLowerCase();
      if (unit === "k") v *= 1000;
      if (unit === "m") v *= 1000000;
      if (Number.isFinite(v)) vals.push(v);
    }
    if (!vals.length) return 0;
    return Math.max(...vals);
  };

  const getProjectUpperBudget = async (projectId) => {
    if (!projectId) return 0;

    let rows;
    try {
      rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ? LIMIT 1`, [
        projectId,
      ]);
    } catch (e) {
      console.warn(
        "[tradesmen/featured] getProjectUpperBudget failed:",
        e?.message || e
      );
      return 0;
    }

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
    const upper =
      explicitUpper != null
        ? explicitUpper
        : explicitLower != null
        ? explicitLower
        : 0;
    if (upper > 0) return upper;

    const text =
      row.description ||
      row.details ||
      row.desc ||
      row.summary ||
      row.notes ||
      "";
    return parseMoneyUpperFromText(String(text));
  };

  // -------- Project-type helper (for tailoring Featured to project) --------
  /**
   * Returns a keyword to match against tradesmen.trade_types
   * e.g. project.type "External Wall Insulation" -> "external wall insulation"
   */
  const getProjectTypeKeyword = async (projectId) => {
    if (!projectId) return null;

    let rows;
    try {
      rows = await mysqlQuery(
        `
        SELECT id, name, type, description
        FROM projects
        WHERE id = ?
        LIMIT 1
      `,
        [projectId]
      );
    } catch (e) {
      console.warn(
        "[tradesmen/featured] getProjectTypeKeyword failed:",
        e?.message || e
      );
      return null;
    }

    const row = rows[0];
    if (!row) return null;

    const rawType =
      (row.type && String(row.type).trim()) ||
      (row.name && String(row.name).trim()) ||
      "";

    if (!rawType) return null;
    return rawType.toLowerCase();
  };

  // -------- Matching helpers --------
  const normalise = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  /**
   * trade_types is a comma/pipe separated list.
   * We consider it a match if ANY token equals the project type
   * OR either string contains the other (to tolerate "Bathroom Refresh" vs "Bathroom").
   */
  const hasTradeMatch = (tradeTypes, projectTypeLower) => {
    if (!tradeTypes || !projectTypeLower) return false;
    const kw = normalise(projectTypeLower);
    if (!kw) return false;

    const parts = String(tradeTypes)
      .split(/[,|]/)
      .map(normalise)
      .filter(Boolean);

    return parts.some((p) => p === kw || p.includes(kw) || kw.includes(p));
  };

  // -------- Tier helpers --------
  const tierRank = (tier) => {
    const t = String(tier || "").toLowerCase();
    if (t === "spotlight") return 0;
    if (t === "gold") return 1;
    if (t === "unlock") return 2;
    return 3; // free/unknown
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
    } catch (_) {
      const first = String(serviceAreas)
        .split(/[,\s]+/)
        .filter(Boolean)[0];
      return first || null;
    }
    return null;
  };

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

  // Hard-coded stars (per request)
  const HARD_STARS = 4.8;

  // Placeholder gallery
  const makePlaceholders = (seed) => [
    `https://placehold.co/400x300?text=Project+${encodeURIComponent(seed)}+1`,
    `https://placehold.co/400x300?text=Project+${encodeURIComponent(seed)}+2`,
    `https://placehold.co/400x300?text=Project+${encodeURIComponent(seed)}+3`,
  ];

  // Active Spotlight set (by payments_oneoff expiry)
  const getActiveSpotlightUserIds = async () => {
    try {
      const rows = await mysqlQuery(
        `
        SELECT DISTINCT user_id
          FROM payments_oneoff
         WHERE LOWER(COALESCE(type,''))   = 'spotlight'
           AND LOWER(COALESCE(status,'')) = 'active'
           AND (expires_at IS NULL OR expires_at > NOW())
        `,
        []
      );
      return new Set(rows.map((r) => String(r.user_id)));
    } catch (e) {
      console.warn(
        "[tradesmen/featured] getActiveSpotlightUserIds failed:",
        e?.message || e
      );
      return new Set();
    }
  };

  // Resolve which photos table exists (tradesmen_photos vs tradesman_photos)
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
        `,
        []
      );
      ctx._vmbPhotoTableResolved = rows[0]?.TABLE_NAME || null;
    } catch (e) {
      console.warn(
        "[tradesmen/featured] resolvePhotoTable failed:",
        e?.message || e
      );
      ctx._vmbPhotoTableResolved = null;
    }
    return ctx._vmbPhotoTableResolved;
  };

  const loadPhotosByUser = async (userIds) => {
    const map = new Map();
    if (!userIds || !userIds.length) return map;

    const photoTable = await resolvePhotoTable();
    if (!photoTable) return map;

    const placeholders = userIds.map(() => "?").join(",");
    let photoRows = [];
    try {
      photoRows = await mysqlQuery(
        `
        SELECT tradesman_user_id, url, sort_order, created_at
          FROM ${photoTable}
         WHERE tradesman_user_id IN (${placeholders})
         ORDER BY tradesman_user_id,
                  COALESCE(sort_order, 999999) ASC,
                  created_at ASC
        `,
        userIds
      );
    } catch (e) {
      console.warn(
        "[tradesmen/featured] loadPhotosByUser failed:",
        e?.message || e
      );
      return map;
    }

    for (const p of photoRows) {
      const uid = String(p.tradesman_user_id);
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid).push(p.url);
    }
    return map;
  };

  router.get("/tradesmen/featured", auth, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(
        50,
        Math.max(1, parseInt(String(req.query.limit ?? "24"), 10))
      );
      const goldFirst =
        String(req.query.goldFirst ?? "true").toLowerCase() !== "false";
      const onlyGold =
        String(req.query.onlyGold ?? "false").toLowerCase() === "true";
      const projectId = req.query.projectId
        ? Number(String(req.query.projectId))
        : null;

      // --- project context ---
      const projectTypeKeyword = projectId
        ? await getProjectTypeKeyword(projectId)
        : null;
      const projectKwLc = projectTypeKeyword
        ? projectTypeKeyword.toLowerCase()
        : null;

      // If the project’s budget >= 15k, Spotlight applies and we EXCLUDE spotlight-active
      const THRESHOLD = 15000;
      const projectUpper = projectId
        ? await getProjectUpperBudget(projectId)
        : 0;
      const spotlightApplies = projectUpper >= THRESHOLD;
      const spotlightActive = await getActiveSpotlightUserIds();

      // --- base rows from tradesmen ---
      let rows;
      try {
        rows = await mysqlQuery(
          `
          SELECT
            user_id,
            company_name,
            contact_name,
            status,
            subscription_status,
            plan,
            purchased_plan,
            ch_status,
            service_areas,
            trade_types,
            vmb_badge,
            offers_discount,
            warranty_months,
            wins_count,
            photo_count,
            likes_count,
            phone,
            email,
            web_url,
            social_links_json,
            company_number,
            vmb_score
          FROM tradesmen
          WHERE COALESCE(status,'active') != 'banned'
        `,
          []
        );
      } catch (e) {
        console.error("[/tradesmen/featured] tradesmen SELECT failed:", e);
        return res.status(500).json({
          error: "FEATURED_TRADESMEN_FAILED",
          message: "Failed to load tradesmen",
        });
      }

      // ---------- load real photo URLs from photos table ----------
      const userIds = rows.map((r) => String(r.user_id));
      const photosByUser = await loadPhotosByUser(userIds);
      // ---------- END PHOTO LOADING ----------

      let shaped = rows
        .map((r) => {
          const tier = normaliseTier(r);
          const uid = String(r.user_id);

          // always exclude active Spotlight from Featured
          if (spotlightActive.has(uid)) return null;
          if (onlyGold && tier !== "gold") return null;

          const builderId = uid;
          const outward = firstServiceArea(r.service_areas);

          const photoUrls = photosByUser.get(builderId) || [];
          const avatarUrl = photoUrls.length > 0 ? photoUrls[0] : null;
          const gallery =
            photoUrls.length > 0
              ? photoUrls.slice(0, 3)
              : makePlaceholders(builderId);

          const matchesProjectType = hasTradeMatch(r.trade_types, projectKwLc);

          return {
            builderId,
            companyName: r.company_name || null,
            displayName: r.company_name || r.contact_name || "Tradesman",
            tier,
            tierActiveUntil: null,
            purchasedPlan: r.purchased_plan || r.plan || null,
            badges: {
              companiesHouseVerified: isChVerified(r),
              insuranceValid: false,
            },
            avatarUrl,
            gallery,
            stats: {
              completed: Number(r.wins_count || 0),
              photos: Number(r.photo_count || photoUrls.length || 0),
              reviews: Number(r.likes_count || 0),
              stars: HARD_STARS,
            },
            score: Number(r.vmb_score ?? 0),
            location: { outward },
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

      // Sort: 1) project-type matches first, 2) paid tiers, 3) score desc, 4) name A→Z
      shaped.sort((a, b) => {
        if (projectKwLc) {
          const am = a.matchesProjectType ? 1 : 0;
          const bm = b.matchesProjectType ? 1 : 0;
          if (am !== bm) return bm - am; // matches first
        }

        if (goldFirst) {
          const t = tierRank(a.tier) - tierRank(b.tier);
          if (t !== 0) return t;
        }

        const s = (b.score || 0) - (a.score || 0);
        if (s !== 0) return s;

        const nameA = (a.companyName || a.displayName || "").toLowerCase();
        const nameB = (b.companyName || b.displayName || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

      const total = shaped.length;
      const start = (page - 1) * limit;
      const items = shaped.slice(start, start + limit);

      return res.json({
        items,
        total,
        page,
        limit,
        projectBudgetUpper: projectUpper || undefined,
        spotlightExcluded: spotlightApplies ? spotlightActive.size : 0,
      });
    } catch (err) {
      console.error("[/tradesmen/featured] error:", err);
      return res.status(500).json({
        error: "FEATURED_TRADESMEN_FAILED",
        message: err?.message || String(err),
      });
    }
  });
};