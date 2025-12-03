// server/routes/tradesmen/me.get.js

/**
 * GET /api/tradesmen/me
 * Auth: required
 *
 * Returns:
 *   - { role: "tradesman", profile: {...} } if a tradesmen row exists for this uid
 *   - { role: "user", profile: null } otherwise
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const TAG = "[tradesmen/me.get]";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  router.get("/tradesmen/me", auth, async (req, res) => {
    const uid = req.user.uid;

    try {
      const rows = await mysqlQuery(
        `
        SELECT
          user_id,
          company_name,
          contact_name,
          phone,
          email,
          trade_types,
          service_areas,
          vmb_score,
          vmb_badge,
          subscription_status,
          status,
          company_number,
          ch_status,
          web_verified,
          web_url,
          social_links_json,
          photo_count,
          supporting_doc_count,
          discount_min_percent,
          discount_max_percent,
          offers_discount,
          warranty_months,
          likes_count,
          wins_count,
          created_at,
          updated_at
        FROM tradesmen
        WHERE user_id = ?
        LIMIT 1
        `,
        [uid]
      );

      const profile = rows[0] || null;

      if (!profile) {
        // No tradesman row -> regular user
        res.set("Cache-Control", "no-store");
        return res.json({ role: "user", profile: null });
      }

      // Any tradesmen row (draft/active/inactive) => role "tradesman"
      res.set("Cache-Control", "no-store");
      return res.json({ role: "tradesman", profile });
    } catch (e) {
      console.error(`${TAG} error:`, e);
      // On error, fail safe but keep shape
      res.set("Cache-Control", "no-store");
      return res.json({ role: "user", profile: null });
    }
  });

  if (!ctx.__logged_tradesmen_me_get) {
    ctx.__logged_tradesmen_me_get = true;
    console.log("[routes] mounted: GET /tradesmen/me");
  }
};
