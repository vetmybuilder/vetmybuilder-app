const { logger } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;
  const TAG = "[public/profile.get]";

  router.get("/t/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: "slug required" });

    try {
      const rows = await mysqlQuery(
        `SELECT
          t.user_id, t.company_name, t.contact_name, t.trade_types,
          t.service_areas, t.status, t.profile_template, t.slug,
          t.vmb_score, t.vmb_badge, t.verification_status,
          t.company_number, t.ch_status, t.web_url,
          t.google_rating, t.google_reviews_count, t.google_place_id,
          t.profile_picture_url, t.about, t.created_at,
          t.offers_discount, t.warranty_months,
          t.likes_count, t.wins_count, t.photo_count
        FROM tradesmen t
        WHERE t.slug = ? AND t.status = 'active' AND t.profile_public = 1
        LIMIT 1`,
        [slug],
      );

      const profile = rows[0];
      if (!profile) return res.status(404).json({ error: "not_found" });

      let photos = [];
      try {
        const photoRows = await mysqlQuery(
          `SELECT url FROM tradesmen_photos WHERE tradesman_user_id = ? ORDER BY id`,
          [profile.user_id],
        );
        photos = photoRows.map((r) => r.url);
      } catch {}

      let recommendations = [];
      try {
        const recRows = await mysqlQuery(
          `SELECT id, name, rating, comment, createdAt,
                  quality_rating, reliability_rating, communication_rating,
                  trust_rating, value_rating
           FROM recommendations
           WHERE linked_tradesman_uid = ? AND comment IS NOT NULL AND comment != ''
           ORDER BY createdAt DESC
           LIMIT 10`,
          [profile.user_id],
        );
        recommendations = recRows.map((r) => ({
          id: r.id,
          name: r.name || "A homeowner",
          rating: r.rating || Math.round(
            ([r.quality_rating, r.reliability_rating, r.communication_rating, r.trust_rating, r.value_rating]
              .filter((x) => x != null)
              .reduce((a, b, _, arr) => a + b / arr.length, 0)) || 5,
          ),
          comment: r.comment,
          createdAt: r.createdAt,
        }));
      } catch {}

      let hireCount = 0;
      try {
        const hireRows = await mysqlQuery(
          `SELECT COUNT(*) AS c FROM hires WHERE tradesmanUserId = ? AND status = 'accepted'`,
          [profile.user_id],
        );
        hireCount = hireRows[0]?.c || 0;
      } catch {}

      // Geocode outward postcodes server-side so the browser never makes
      // failing requests. Only valid outcodes resolve; the rest are skipped.
      let areaPoints = [];
      try {
        const outcodes = String(profile.service_areas || "")
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s) => /^[A-Z]{1,2}[0-9][0-9A-Z]?$/.test(s));

        const results = await Promise.all(
          outcodes.map(async (code) => {
            try {
              const r = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(code)}`);
              if (!r.ok) return null;
              const j = await r.json();
              if (j?.result?.latitude && j?.result?.longitude) {
                return { code, lat: j.result.latitude, lng: j.result.longitude };
              }
              return null;
            } catch {
              return null;
            }
          }),
        );
        areaPoints = results.filter(Boolean);
      } catch {}

      res.set("Cache-Control", "public, max-age=300");
      res.json({
        company_name: profile.company_name,
        contact_name: profile.contact_name,
        trade_types: profile.trade_types,
        service_areas: profile.service_areas,
        template: profile.profile_template,
        slug: profile.slug,
        about: profile.about,
        vmb_badge: profile.vmb_badge,
        verification_status: profile.verification_status,
        company_number: profile.company_number,
        google_rating: profile.google_rating,
        google_reviews_count: profile.google_reviews_count,
        profile_picture_url: profile.profile_picture_url,
        web_url: profile.web_url,
        member_since: profile.created_at,
        offers_discount: profile.offers_discount,
        warranty_months: profile.warranty_months,
        photo_urls: photos,
        recommendations,
        hire_count: hireCount,
        recommendation_count: recommendations.length,
        area_points: areaPoints,
      });
    } catch (err) {
      logger.error({ err: err?.message }, `${TAG} failed`);
      res.status(500).json({ error: "internal_error" });
    }
  });
};
