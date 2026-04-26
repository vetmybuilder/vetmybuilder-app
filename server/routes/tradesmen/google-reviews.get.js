// server/routes/tradesmen/google-reviews.get.js

module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen.google-reviews.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  log.info?.(`${TAG} mounted`);

  // In e2e, keep stdout clean (don’t spam warnings)
  const IS_E2E = String(process.env.TEST_ENV || "").toLowerCase() === "e2e";

  // --- helpers ------------------------------------------------------------

  const tableExists = async (name) => {
    try {
      const safe = String(name).replace(/\\/g, "\\\\").replace(/_/g, "\\_").replace(/%/g, "\\%").replace(/'/g, "\\'");
      const rows = await mysqlQuery(`SHOW TABLES LIKE '${safe}'`);
      return rows.length > 0;
    } catch (e) {
      log.warn?.(`${TAG} tableExists(${name}) failed`, { error: e?.message });
      return false;
    }
  };

  const ensureGoogleCols = async () => {
    // cache per process
    if (ctx.__googleColsChecked) return ctx.__googleColsChecked;
    ctx.__googleColsChecked = {
      hasGooglePlaceId: false,
      hasGoogleRating: false,
      hasGoogleReviewsCount: false,
      hasCompanyNumber: false,
    };

    try {
      const rows = await mysqlQuery(
        `
        SELECT COLUMN_NAME
          FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'tradesmen'
        `
      );

      const cols = new Set((rows || []).map((r) => r.COLUMN_NAME));

      ctx.__googleColsChecked.hasGooglePlaceId = cols.has("google_place_id");
      ctx.__googleColsChecked.hasGoogleRating = cols.has("google_rating");
      ctx.__googleColsChecked.hasGoogleReviewsCount = cols.has(
        "google_reviews_count"
      );
      ctx.__googleColsChecked.hasCompanyNumber = cols.has("company_number");

      // log once (and don’t warn in e2e)
      if (!ctx.__googleColsLogged) {
        ctx.__googleColsLogged = true;

        const out = [];
        if (!ctx.__googleColsChecked.hasGooglePlaceId)
          out.push("google_place_id");
        if (!ctx.__googleColsChecked.hasGoogleRating) out.push("google_rating");
        if (!ctx.__googleColsChecked.hasGoogleReviewsCount)
          out.push("google_reviews_count");
        if (!ctx.__googleColsChecked.hasCompanyNumber)
          out.push("company_number");

        if (out.length) {
          const msg = `${TAG} missing columns on tradesmen: ${out.join(
            ", "
          )} (migration 027?)`;

          if (IS_E2E) log.info?.(msg);
          else log.warn?.(msg);
        }
      }
    } catch (e) {
      if (IS_E2E) {
        log.info?.(`${TAG} ensureGoogleCols failed`, { error: e?.message });
      } else {
        log.warn?.(`${TAG} ensureGoogleCols failed`, { error: e?.message });
      }
    }

    return ctx.__googleColsChecked;
  };

  // kick off in background (safe)
  ensureGoogleCols();

  router.get("/tradesmen/:id/google-reviews", async (req, res) => {
    const { id } = req.params || {};
    log.info?.(`${TAG} request`, { id });

    try {
      if (!id) {
        return res.status(400).json({ error: "id_required" });
      }

      const cols = await ensureGoogleCols();

      const numericId = /^\d+$/.test(String(id)) ? Number(id) : null;

      // If columns don't exist, select NULL/0 aliases so the query still works.
      const selectGooglePlaceId = cols.hasGooglePlaceId
        ? "google_place_id"
        : "NULL AS google_place_id";
      const selectGoogleRating = cols.hasGoogleRating
        ? "google_rating"
        : "NULL AS google_rating";
      const selectGoogleReviewsCount = cols.hasGoogleReviewsCount
        ? "google_reviews_count"
        : "0 AS google_reviews_count";
      const selectCompanyNumber = cols.hasCompanyNumber
        ? "company_number"
        : "NULL AS company_number";

      let rows;
      try {
        rows = await mysqlQuery(
          `
          SELECT
            id,
            user_id,
            company_name,
            ${selectCompanyNumber},
            ${selectGooglePlaceId},
            ${selectGoogleRating},
            ${selectGoogleReviewsCount}
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

      // ---------------------------------------------------------------
      // Review snippets
      // ---------------------------------------------------------------
      // Production currently only surfaces the rating + count and links
      // out to Google for full reviews. Mobile design needs short review
      // write-ups to display 3 snippet cards. Until the real Google
      // Places `reviews` field is wired up, return deterministic
      // fixtures in dev so the UI can render. Production stays empty so
      // we never display fake reviews to real users.
      let reviews = [];
      if (
        process.env.NODE_ENV !== "production" &&
        String(process.env.TEST_ENV || "").toLowerCase() !== "e2e" &&
        rating != null
      ) {
        reviews = buildFixtureReviews(row.company_name);
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
        reviews,
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

// Deterministic mock review snippets keyed off the company name. Only
// invoked in dev (see guard above) — production returns an empty array
// until the real Google Places `reviews` integration is wired up.
function buildFixtureReviews(companyName) {
  const seed = String(companyName || "Trader").trim();
  const TEMPLATES = [
    {
      author: "Jamie S.",
      initials: "JS",
      rating: 5,
      relativeTime: "2 weeks ago",
      text:
        `Brilliant work from ${seed}. Tidy, on time, and fairly priced. Would absolutely use them again.`,
    },
    {
      author: "Marie K.",
      initials: "MK",
      rating: 5,
      relativeTime: "1 month ago",
      text:
        "Lovely team, kept the place clean throughout. Great communication from start to finish.",
    },
    {
      author: "Tom W.",
      initials: "TW",
      rating: 4,
      relativeTime: "3 months ago",
      text:
        "Good quality work, took a couple of days longer than estimated but the finish was excellent.",
    },
  ];
  return TEMPLATES;
}
