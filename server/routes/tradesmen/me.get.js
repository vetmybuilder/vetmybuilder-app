// server/routes/tradesmen/me.get.js

/**
 * GET /api/tradesmen/me
 * Auth: required
 *
 * Returns:
 *   - { role: "tradesman", profile: {..., photo_urls: string[]} } if a tradesmen row exists for this uid
 *   - { role: "user", profile: null } otherwise
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/me.get]";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  let photosEnsured = false;
  async function ensurePhotosTable() {
    if (photosEnsured) return;
    photosEnsured = true;

    try {
      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS tradesmen_photos (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tradesman_user_id VARCHAR(255) NOT NULL,
          url TEXT NOT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_tradesmen_photos_user (tradesman_user_id, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    } catch (e) {
      // Non-fatal: if ensure fails, we'll just return without photos.
      log.warn(`${TAG} ensurePhotosTable failed`, { error: e?.message || e });
    }
  }

  router.get("/tradesmen/me", auth, async (req, res) => {
    const uid = req.user.uid;
    log.info(`${TAG} request`, { uid });

    try {
      await ensurePhotosTable();

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
          review_links_json,
          photo_count,
          supporting_doc_count,
          discount_min_percent,
          discount_max_percent,
          offers_discount,
          warranty_months,
          likes_count,
          wins_count,
          profile_picture_url,
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

      // Fetch photo URLs from tradesmen_photos (source of truth)
      let photo_urls = [];
      try {
        const photoRows = await mysqlQuery(
          `
          SELECT url
            FROM tradesmen_photos
           WHERE tradesman_user_id = ?
           ORDER BY sort_order ASC, id ASC
          `,
          [uid]
        );

        photo_urls = (photoRows || [])
          .map((r) => r?.url)
          .filter(Boolean)
          .map(String);

        profile.photo_urls = photo_urls;

        // Compute avatar_url (respects profile_picture_url if still in photo set)
        const savedPic = profile.profile_picture_url || null;
        profile.avatar_url =
          savedPic && photo_urls.includes(savedPic)
            ? savedPic
            : photo_urls[0] || null;

        // Keep photo_count consistent even if older data exists
        if (typeof profile.photo_count === "number") {
          // leave it as-is, but if it's wrong we can correct it:
          if (profile.photo_count !== photo_urls.length) {
            profile.photo_count = photo_urls.length;
          }
        } else {
          profile.photo_count = photo_urls.length;
        }
      } catch (e) {
        log.warn(`${TAG} failed to load tradesmen_photos`, {
          uid,
          error: e?.message || e,
        });
        profile.photo_urls = [];
      }

      log.info(`${TAG} tradesman found`, {
        uid,
        company: profile.company_name,
        status: profile.status,
        vmb_score: profile.vmb_score,
        badge: profile.vmb_badge,
        photos: Array.isArray(profile.photo_urls)
          ? profile.photo_urls.length
          : 0,
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
