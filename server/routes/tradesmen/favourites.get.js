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

    if (!rows?.length) {
      log.info?.(`${TAG} end`, { count: 0 });
      return res.json({ items: [] });
    }

    const builderIds = rows.map((r) => String(r.builderId));
    const photosByBuilder = await loadPhotosByBuilder(builderIds);

    const items = rows.map((r) => {
      const builderId = String(r.builderId);
      const urls = photosByBuilder[builderId] || [];
      const avatarUrl = urls.length ? makeAbsolute(urls[0]) : null;

      const photoCountFromTradesmen = Number(r.photo_count);
      const photosCount = Number.isFinite(photoCountFromTradesmen)
        ? photoCountFromTradesmen
        : urls.length;

      return {
        builderId,
        publicId: r.publicId || null,
        companyName: r.company_name || null,
        displayName: r.company_name || r.contact_name || "Tradesman",
        tier: normaliseTier(r),
        badge: r.vmb_badge || null,
        score: Number(r.vmb_score ?? 0),
        serviceAreas: parseServiceAreas(r.service_areas),
        avatarUrl,
        stats: {
          completed: Number(r.wins_count || 0),
          photos: Number(photosCount || 0),
          reviews: Number(r.likes_count || 0),
        },
        tradeTypes: r.trade_types || null,
        isFavourite: true,
      };
    });

    log.info?.(`${TAG} end`, { count: items.length });
    return res.json({ items });
  });

  if (!ctx.__logged_tradesmen_favourites_get) {
    ctx.__logged_tradesmen_favourites_get = true;
    log.info?.("[routes] mounted GET /api/tradesmen/favourites");
  }
};
