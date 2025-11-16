// server/routes/tradesmen/favourites.get.js
/**
 * GET /api/tradesmen/favourites
 *
 * Auth: required
 * Returns: { items: [...] } – list of favourite tradesmen for current user
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  const hasTable = (name) =>
    !!db
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`
      )
      .get(name);

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

  router.get("/tradesmen/favourites", auth, (req, res) => {
    try {
      if (!hasTable("favourite_tradesmen") || !hasTable("tradesmen")) {
        // If there is no table yet, just return empty list
        return res.json({ items: [] });
      }

      const userId = req.user && req.user.uid;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const rows = db
        .prepare(
          `
          SELECT
            t.user_id              AS builderId,
            t.company_name         AS company_name,
            t.contact_name         AS contact_name,
            t.vmb_score            AS vmb_score,
            t.vmb_badge            AS vmb_badge,
            t.web_url              AS web_url,
            t.service_areas        AS service_areas,
            t.subscription_status  AS subscription_status,
            t.plan                 AS plan,
            t.purchased_plan       AS purchased_plan,
            t.wins_count           AS wins_count,
            t.photo_count          AS photo_count,
            t.likes_count          AS likes_count,
            t.status               AS status,
            f.createdAt            AS fav_created_at
          FROM favourite_tradesmen f
          JOIN tradesmen t ON t.user_id = f.builderId
          WHERE f.userId = ?
            AND (t.status IS NULL OR LOWER(t.status) != 'banned')
          ORDER BY f.createdAt DESC
        `
        )
        .all(userId);

      // optional photos for avatars
      const PHOTO_TABLE = hasTable("tradesman_photos")
        ? "tradesman_photos"
        : hasTable("tradesmen_photos")
        ? "tradesmen_photos"
        : null;

      let photoRowsByBuilder = {};
      if (PHOTO_TABLE && rows.length) {
        const ids = rows.map((r) => r.builderId);
        const placeholders = ids.map(() => "?").join(",");
        const photos = db
          .prepare(
            `
            SELECT tradesman_user_id AS builderId, url, sort_order, created_at
              FROM ${PHOTO_TABLE}
             WHERE tradesman_user_id IN (${placeholders})
             ORDER BY COALESCE(sort_order, 999999) ASC, created_at ASC
          `
          )
          .all(...ids);
        for (const p of photos) {
          const key = String(p.builderId);
          if (!photoRowsByBuilder[key]) photoRowsByBuilder[key] = [];
          photoRowsByBuilder[key].push(p);
        }
      }

      const items = rows.map((row) => {
        const builderId = String(row.builderId);
        const serviceAreas = parseServiceAreas(row.service_areas);
        const tier = normaliseTier(row);

        const photos = photoRowsByBuilder[builderId] || [];
        const photoUrls = photos.map((p) => makeAbsolute(p.url));

        const avatarUrl = photoUrls.length ? photoUrls[0] : null;

        return {
          builderId,
          companyName: row.company_name || null,
          displayName: row.company_name || row.contact_name || "Tradesman",
          tier,
          badge: row.vmb_badge || null,
          score: Number(row.vmb_score ?? 0),
          serviceAreas,
          avatarUrl,
          stats: {
            completed: Number(row.wins_count || 0),
            photos: Number(row.photo_count || photoUrls.length || 0),
            reviews: Number(row.likes_count || 0),
          },
          isFavourite: 1,
        };
      });

      return res.json({ items });
    } catch (e) {
      console.error("[GET /tradesmen/favourites] error", e);
      return res.status(500).json({
        error: "FAILED",
        message: e?.message || String(e),
      });
    }
  });

  if (!ctx.__logged_tradesmen_favourites_get) {
    ctx.__logged_tradesmen_favourites_get = true;
    console.log("[routes] mounted: GET /api/tradesmen/favourites");
  }
};
