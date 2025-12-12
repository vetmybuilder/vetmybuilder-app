// server/routes/tradesmen/favourites.get.js
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/favourites.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const parseServiceAreas = (serviceAreas) => {
    if (!serviceAreas) return [];
    try {
      const parsed = JSON.parse(serviceAreas);
      if (Array.isArray(parsed))
        return parsed.filter(Boolean).map((v) => String(v).trim());
      if (parsed && typeof parsed === "object")
        return Object.values(parsed)
          .filter(Boolean)
          .map((v) => String(v).trim());
    } catch {}
    return String(serviceAreas)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
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

  const loadPhotosByBuilder = async (builderIds) => {
    const map = {};
    if (!builderIds?.length) return map;
    const tbl = await resolvePhotoTable();
    if (!tbl) return map;

    try {
      const placeholders = builderIds.map(() => "?").join(",");
      const rows = await mysqlQuery(
        `
        SELECT tradesman_user_id AS builderId, url
          FROM ${tbl}
         WHERE tradesman_user_id IN (${placeholders})
         ORDER BY tradesman_user_id, COALESCE(sort_order,999999), created_at
        `,
        builderIds
      );
      for (const r of rows) {
        const key = String(r.builderId);
        if (!map[key]) map[key] = [];
        map[key].push(r.url);
      }
    } catch (e) {
      log.warn?.(`${TAG} loadPhotosByBuilder error`, { error: e?.message });
    }

    return map;
  };

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
          t.status,
          f.createdAt AS fav_created_at
        FROM favourite_tradesmen f
        JOIN tradesmen t ON t.user_id = f.builderId
        WHERE f.userId = ?
          AND (t.status IS NULL OR LOWER(t.status) != 'banned')
        ORDER BY f.createdAt DESC
        `,
        [userId]
      );
    } catch (e) {
      if (e?.errno === 1146) {
        log.warn?.(`${TAG} favourites table missing`);
        return res.json({ items: [] });
      }
      log.error?.(`${TAG} SELECT failed`, { error: e?.message });
      return res.status(500).json({ error: "FAILED" });
    }

    if (!rows.length) return res.json({ items: [] });

    const photos = await loadPhotosByBuilder(
      rows.map((r) => String(r.builderId))
    );

    const items = rows.map((r) => {
      const builderId = String(r.builderId);
      const serviceAreas = parseServiceAreas(r.service_areas);
      const tier = normaliseTier(r);
      const urls = photos[builderId] || [];
      const avatarUrl = urls.length ? makeAbsolute(urls[0]) : null;

      return {
        builderId,
        companyName: r.company_name || null,
        displayName: r.company_name || r.contact_name || "Tradesman",
        tier,
        badge: r.vmb_badge,
        score: Number(r.vmb_score ?? 0),
        serviceAreas,
        avatarUrl,
        stats: {
          completed: Number(r.wins_count || 0),
          photos: Number(r.photo_count || urls.length || 0),
          reviews: Number(r.likes_count || 0),
        },
        isFavourite: 1,
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
