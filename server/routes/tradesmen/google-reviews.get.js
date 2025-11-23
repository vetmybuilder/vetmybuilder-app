// server/routes/tradesmen/google-reviews.get.js
//
// GET /api/tradesmen/:id/google-reviews
// Returns the stored Google review metadata (place id, rating, count)
// for a given tradesman. This is intended to power the builder profile page.
//
module.exports = (router, ctx) => {
  const { db } = ctx;
  const TAG = "[tradesmen.google-reviews.get]";

  // Helper: inspect table columns (defensive in case migrations lag)
  const tblCols = (name) =>
    new Set(
      db
        .prepare(`PRAGMA table_info(${name})`)
        .all()
        .map((r) => r.name)
    );

  const ensureGoogleCols = () => {
    const cols = tblCols("tradesmen");
    if (!cols.has("google_place_id")) {
      console.warn(
        `${TAG} tradesmen.google_place_id missing – did you run migration 027?`
      );
    }
    if (!cols.has("google_rating")) {
      console.warn(
        `${TAG} tradesmen.google_rating missing – did you run migration 027?`
      );
    }
    if (!cols.has("google_reviews_count")) {
      console.warn(
        `${TAG} tradesmen.google_reviews_count missing – did you run migration 027?`
      );
    }
  };

  ensureGoogleCols();

  // IMPORTANT: no /api prefix here (added when mounting routers in index.js)
  router.get("/tradesmen/:id/google-reviews", (req, res) => {
    const { id } = req.params || {};
    if (!id) {
      return res.status(400).json({ error: "id_required" });
    }

    // Support both:
    //  - Firebase uid style user_id (string)
    //  - numeric tradesmen.id (integer)
    let numericId = null;
    if (/^\d+$/.test(String(id))) {
      numericId = Number(id);
    }

    const row = db
      .prepare(
        `
        SELECT
          id,
          user_id,
          company_name,
          google_place_id,
          google_rating,
          google_reviews_count
        FROM tradesmen
        WHERE user_id = @id
           OR (@numericId IS NOT NULL AND id = @numericId)
        LIMIT 1
      `
      )
      .get({
        id: String(id),
        numericId,
      });

    if (!row) {
      return res.status(404).json({ error: "tradesman_not_found" });
    }

    const payload = {
      ok: true,
      tradesmanId: row.id,
      userId: row.user_id,
      companyName: row.company_name,
      googlePlaceId: row.google_place_id || null,
      rating:
        row.google_rating === null || row.google_rating === undefined
          ? null
          : Number(row.google_rating),
      reviewsCount: Number(row.google_reviews_count || 0),

      // Placeholder for when you later plug in live Google Places data
      reviews: [], // e.g. [{ author, rating, text, time }, ...]
    };

    console.log(
      `${TAG} id=${id} -> placeId=${payload.googlePlaceId || "-"} rating=${
        payload.rating ?? "-"
      } count=${payload.reviewsCount}`
    );

    return res.json(payload);
  });

  if (!ctx.__logged_tradesmen_google_reviews_get) {
    ctx.__logged_tradesmen_google_reviews_get = true;
    console.log(
      "[routes] mounted: GET /tradesmen/:id/google-reviews (google reviews)"
    );
  }
};
