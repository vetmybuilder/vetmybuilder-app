// server/routes/tradesmen/google-reviews.get.js

module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen.google-reviews.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  log.info?.(`${TAG} mounted`);

  // --- helpers ------------------------------------------------------------

  const tableExists = async (name) => {
    try {
      const rows = await mysqlQuery(`SHOW TABLES LIKE ?`, [name]);
      return rows.length > 0;
    } catch (e) {
      log.warn?.(`${TAG} tableExists(${name}) failed`, { error: e?.message });
      return false;
    }
  };

  const ensureGoogleCols = async () => {
    try {
      const rows = await mysqlQuery(
        `
        SELECT COLUMN_NAME
          FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'tradesmen'
        `
      );

      const cols = new Set(rows.map((r) => r.COLUMN_NAME));
      if (!cols.has("google_place_id"))
        log.warn?.(`${TAG} google_place_id missing (migration 027?)`);
      if (!cols.has("google_rating"))
        log.warn?.(`${TAG} google_rating missing (migration 027?)`);
      if (!cols.has("google_reviews_count"))
        log.warn?.(`${TAG} google_reviews_count missing (migration 027?)`);
      if (!cols.has("company_number"))
        log.warn?.(`${TAG} company_number missing (CH fallback may break)`);
    } catch (e) {
      log.warn?.(`${TAG} ensureGoogleCols failed`, { error: e?.message });
    }
  };

  ensureGoogleCols();

  router.get("/tradesmen/:id/google-reviews", async (req, res) => {
    const { id } = req.params || {};
    log.info?.(`${TAG} request`, { id });

    try {
      if (!id) {
        return res.status(400).json({ error: "id_required" });
      }

      let numericId = /^\d+$/.test(String(id)) ? Number(id) : null;

      let rows;
      try {
        rows = await mysqlQuery(
          `
          SELECT
            id,
            user_id,
            company_name,
            company_number,
            google_place_id,
            google_rating,
            google_reviews_count
          FROM tradesmen
          WHERE user_id = ?
             OR (? IS NOT NULL AND id = ?)
          LIMIT 1
        `,
          [String(id), numericId, numericId]
        );
      } catch (e) {
        log.error?.(`${TAG} tradesmen SELECT failed`, { error: e?.message });
        return res.status(500).json({ error: "internal_error" });
      }

      const row = rows[0];
      if (!row) {
        log.info?.(`${TAG} not found`, { id });
        return res.status(404).json({ error: "tradesman_not_found" });
      }

      let googlePlaceId =
        row.google_place_id == null ? null : String(row.google_place_id);
      let rating = row.google_rating == null ? null : Number(row.google_rating);
      let reviewsCount =
        row.google_reviews_count == null ? 0 : Number(row.google_reviews_count);

      // fallback from company_verifications
      if (!googlePlaceId || rating == null || !reviewsCount) {
        const exists = await tableExists("company_verifications");
        if (exists) {
          try {
            const verRows = await mysqlQuery(
              `
              SELECT google_place_id, google_rating, google_reviews_count
                FROM company_verifications
               WHERE company_number = ?
               ORDER BY checked_at DESC, id DESC
               LIMIT 1
            `,
              [row.company_number || null]
            );

            const ver = verRows[0];
            if (ver) {
              if (!googlePlaceId && ver.google_place_id)
                googlePlaceId = String(ver.google_place_id);
              if (rating == null && ver.google_rating != null)
                rating = Number(ver.google_rating);
              if (!reviewsCount && ver.google_reviews_count != null)
                reviewsCount = Number(ver.google_reviews_count);
            }
          } catch (e) {
            log.warn?.(`${TAG} fallback failed`, { error: e?.message });
          }
        }
      }

      const payload = {
        ok: true,
        tradesmanId: row.id,
        userId: row.user_id,
        companyName: row.company_name,
        companyNumber: row.company_number || null,
        googlePlaceId,
        rating,
        reviewsCount,
        reviews: [],
      };

      log.info?.(`${TAG} success`, {
        id,
        placeId: payload.googlePlaceId,
        rating: payload.rating,
        reviewsCount: payload.reviewsCount,
      });

      return res.json(payload);
    } catch (e) {
      log.error?.(`${TAG} handler error`, { error: e?.message });
      return res.status(500).json({ error: "internal_error" });
    }
  });

  if (!ctx.__logged_tradesmen_google_reviews_get) {
    ctx.__logged_tradesmen_google_reviews_get = true;
    log.info?.(`${TAG} mounted route GET /tradesmen/:id/google-reviews`);
  }
};
