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
  const log = ctx.log || console;
  const TAG = "[tradesmen/me.get]";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  router.get("/tradesmen/me", auth, async (req, res) => {
    const uid = req.user.uid;
    log.info(`${TAG} request`, { uid });

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
        log.info(`${TAG} no tradesman row found`, { uid });
        res.set("Cache-Control", "no-store");
        return res.json({ role: "user", profile: null });
      }

      log.info(`${TAG} tradesman found`, {
        uid,
        company: profile.company_name,
        status: profile.status,
        vmb_score: profile.vmb_score,
        badge: profile.vmb_badge,
      });

      res.set("Cache-Control", "no-store");
      return res.json({ role: "tradesman", profile });
    } catch (e) {
      log.error(`${TAG} error`, { uid, error: e?.message || e });

      // Fail safe but with correct shape
      res.set("Cache-Control", "no-store");
      return res.json({ role: "user", profile: null });
    }
  });

  if (!ctx.__logged_tradesmen_me_get) {
    ctx.__logged_tradesmen_me_get = true;
    log.info("[routes] mounted: GET /tradesmen/me");
  }
};
