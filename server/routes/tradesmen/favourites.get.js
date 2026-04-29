// server/routes/tradesmen/favourites.get.js
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/favourites.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  function parseServiceAreas(serviceAreas) {
    if (!serviceAreas) return [];

    try {
      const parsed = JSON.parse(serviceAreas);

      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v || "").trim()).filter(Boolean);
      }

      if (parsed && typeof parsed === "object") {
        return Object.values(parsed)
          .map((v) => String(v || "").trim())
          .filter(Boolean);
      }
    } catch {
      // fall through
    }

    return String(serviceAreas)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function normaliseTier(row) {
    const raw = String(
      row.plan || row.purchased_plan || row.subscription_status || "free",
    )
      .trim()
      .toLowerCase();

    if (["spotlight", "gold", "unlock", "free"].includes(raw)) return raw;
    if (raw.includes("spot")) return "spotlight";
    if (raw.includes("gold")) return "gold";
    if (raw.includes("unlock")) return "unlock";
    return "free";
  }

  function makeAbsolute(urlOrPath) {
    if (!urlOrPath) return null;

    const s = String(urlOrPath).trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;

    const base = (
      process.env.MEDIA_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      ""
    ).trim();

    const cleanPath = s.startsWith("/") ? s : `/${s}`;
    if (!base) return cleanPath;

    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${cleanBase}${cleanPath}`;
  }

  async function resolvePhotoTable() {
    if (ctx._vmbPhotoTableResolved !== undefined)
      return ctx._vmbPhotoTableResolved;

    try {
      const rows = await mysqlQuery(
        `
        SELECT TABLE_NAME
          FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME IN ('tradesmen_photos','tradesman_photos')
         LIMIT 1
        `,
      );

      ctx._vmbPhotoTableResolved = rows[0]?.TABLE_NAME || null;
      return ctx._vmbPhotoTableResolved;
    } catch (e) {
      log.warn?.(`${TAG} resolvePhotoTable failed`, { error: e?.message });
      ctx._vmbPhotoTableResolved = null;
      return null;
    }
  }

  async function loadPhotosByBuilder(builderIds) {
    const out = {};
    if (!Array.isArray(builderIds) || !builderIds.length) return out;

    const tbl = await resolvePhotoTable();
    if (!tbl) return out;

    try {
      const placeholders = builderIds.map(() => "?").join(",");
      const rows = await mysqlQuery(
        `
        SELECT tradesman_user_id AS builderId, url
          FROM ${tbl}
         WHERE tradesman_user_id IN (${placeholders})
         ORDER BY tradesman_user_id, COALESCE(sort_order,999999), created_at
        `,
        builderIds,
      );

      for (const r of rows) {
        const key = String(r.builderId || "");
        if (!key) continue;
        if (!out[key]) out[key] = [];
        out[key].push(r.url);
      }
    } catch (e) {
      log.warn?.(`${TAG} loadPhotosByBuilder error`, { error: e?.message });
    }

    return out;
  }

  router.get("/tradesmen/favourites", auth, async (req, res) => {
    const userId = req.user?.uid;
    log.info?.(`${TAG} start`, { userId });

    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    let rows;
    try {
      rows = await mysqlQuery(
        `
        SELECT
          t.user_id AS builderId,
          t.public_id AS publicId,
          t.company_name,
          t.contact_name,
          t.vmb_score,
          t.vmb_badge,
          t.web_url,
          t.service_areas,
          t.subscription_status,
          t.plan,
          t.purchased_plan,
          t.wins_count,
          t.photo_count,
          t.likes_count,
          t.trade_types,
          t.status,
          t.google_rating,
          t.google_reviews_count,
          t.ch_status,
          f.createdAt AS fav_created_at
        FROM favourite_tradesmen f
        JOIN tradesmen t ON t.user_id = f.builderId
        WHERE f.userId = ?
          AND (t.status IS NULL OR LOWER(t.status) != 'banned')
        ORDER BY f.createdAt DESC
        `,
        [userId],
      );
    } catch (e) {
      // Table doesn't exist yet (or schema not applied) -> treat as "no favourites"
      if (e?.errno === 1146) {
        if (!ctx.__warned_missing_favourite_tradesmen) {
          ctx.__warned_missing_favourite_tradesmen = true;
          log.warn?.(`${TAG} favourite_tradesmen table missing`);
        }
        return res.json({ items: [] });
      }

      log.error?.(`${TAG} SELECT failed`, { error: e?.message });
      return res.status(500).json({ error: "FAILED" });
    }

    const builderIds = (rows || []).map((r) => String(r.builderId));
    const photosByBuilder = await loadPhotosByBuilder(builderIds);

    // ------------------------------------------------------------
    // Recommendation back-link
    // ------------------------------------------------------------
    // When a homeowner favourited a builder from the recommendation
    // profile (/builders/:recId), tapping that favourite should bring
    // them back to that same recommendation view (rich AI summary,
    // community comments, etc.) rather than the generic tradesman
    // profile. Look up the most recent recommendation that links to
    // each favourited tradesman in any project the viewer owns.
    // Cover photo for the V1 card list comes from the matched
    // recommendation's photos (so we get the project-specific shot
    // they saw when favouriting).
    let recsByBuilder = {};
    if (builderIds.length > 0) {
      try {
        const placeholders = builderIds.map(() => "?").join(",");
        const recRows = await mysqlQuery(
          `
          SELECT r.id AS recommendationId,
                 r.linked_tradesman_uid AS builderId,
                 r.projectId,
                 (SELECT rp.filePath FROM recommendation_photos rp
                    WHERE rp.recommendationId = r.id
                    ORDER BY rp.id ASC LIMIT 1) AS coverPhoto
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
           WHERE p.ownerUserId = ?
             AND r.linked_tradesman_uid IN (${placeholders})
           ORDER BY r.createdAt DESC, r.id DESC
          `,
          [userId, ...builderIds],
        );
        for (const rr of recRows) {
          const key = String(rr.builderId);
          if (!recsByBuilder[key]) {
            recsByBuilder[key] = {
              recommendationId: rr.recommendationId,
              projectId: rr.projectId,
              coverPhoto: rr.coverPhoto || null,
            };
          }
        }
      } catch (e) {
        log.warn?.(`${TAG} recommendation back-link lookup failed`, {
          error: e?.message,
        });
      }
    }

    const items = (rows || []).map((r) => {
      const builderId = String(r.builderId);
      const urls = photosByBuilder[builderId] || [];
      const recMatch = recsByBuilder[builderId] || null;

      const avatarUrl = urls.length
        ? makeAbsolute(urls[0])
        : recMatch?.coverPhoto
          ? makeAbsolute(recMatch.coverPhoto)
          : null;

      const photoCountFromTradesmen = Number(r.photo_count);
      const photosCount = Number.isFinite(photoCountFromTradesmen)
        ? photoCountFromTradesmen
        : urls.length;

      return {
        kind: "tradesman",
        builderId,
        publicId: r.publicId || null,
        companyName: r.company_name || null,
        displayName: r.company_name || r.contact_name || "Tradesman",
        tier: normaliseTier(r),
        badge: r.vmb_badge || null,
        score: Number(r.vmb_score ?? 0),
        serviceAreas: parseServiceAreas(r.service_areas),
        avatarUrl,
        coverPhotoUrl: recMatch?.coverPhoto
          ? makeAbsolute(recMatch.coverPhoto)
          : avatarUrl,
        stats: {
          completed: Number(r.wins_count || 0),
          photos: Number(photosCount || 0),
          reviews: Number(r.likes_count || 0),
        },
        tradeTypes: r.trade_types || null,
        isFavourite: true,
        // Back-link to the rich recommendation profile if the
        // favourite originated from one of the viewer's projects.
        recommendationId: recMatch?.recommendationId || null,
        recommendationProjectId: recMatch?.projectId || null,
        googleRating:
          typeof r.google_rating === "number" ? r.google_rating : null,
        googleReviewsCount:
          typeof r.google_reviews_count === "number"
            ? r.google_reviews_count
            : 0,
        chVerified: String(r.ch_status || "").toLowerCase() === "verified",
      };
    });

    // Recommendations live under their own tab now - they used to be
    // auto-injected here but that conflated "saved by user" with "any
    // active recommendation on my projects". The dedicated /api/
    // recommendations/inbox endpoint surfaces them separately.

    log.info?.(`${TAG} end`, { count: items.length });
    return res.json({ items });
  });

  if (!ctx.__logged_tradesmen_favourites_get) {
    ctx.__logged_tradesmen_favourites_get = true;
    log.info?.("[routes] mounted GET /api/tradesmen/favourites");
  }
};
