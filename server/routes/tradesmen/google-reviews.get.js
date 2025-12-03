//
// GET /api/tradesmen/:id/google-reviews
// Returns the stored Google review metadata (place id, rating, count)
// for a given tradesman. This is intended to power the builder profile page.
//
module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;
  const TAG = "[tradesmen.google-reviews.get]";

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx (MySQL required)");
  }

  // --- helpers ------------------------------------------------------------

  const tableExists = async (name) => {
    try {
      const rows = await mysqlQuery(`SHOW TABLES LIKE ?`, [name]);
      return rows.length > 0;
    } catch (e) {
      console.warn(`${TAG} tableExists(${name}) failed:`, e?.message || e);
      return false;
    }
  };

  // Helper: inspect table columns (defensive in case migrations lag)
  const ensureGoogleCols = async () => {
    try {
      const rows = await mysqlQuery(
        `
        SELECT COLUMN_NAME
          FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'tradesmen'
        `,
        []
      );
      const cols = new Set(rows.map((r) => r.COLUMN_NAME));

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
      if (!cols.has("company_number")) {
        console.warn(
          `${TAG} tradesmen.company_number missing – some fallbacks may not work`
        );
      }
    } catch (e) {
      console.warn(`${TAG} ensureGoogleCols failed:`, e?.message || e);
    }
  };

  // fire-and-forget column sanity check
  ensureGoogleCols();

  // IMPORTANT: no /api prefix here (added when mounting routers in index.js)
  router.get("/tradesmen/:id/google-reviews", async (req, res) => {
    try {
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
        console.error(`${TAG} tradesmen SELECT failed:`, e?.message || e);
        return res
          .status(500)
          .json({ error: "internal_error", message: "query_failed" });
      }

      const row = rows[0] || null;

      if (!row) {
        return res.status(404).json({ error: "tradesman_not_found" });
      }

      // Primary source: fields stored on tradesmen row
      let googlePlaceId =
        row.google_place_id === undefined || row.google_place_id === null
          ? null
          : String(row.google_place_id);
      let rating =
        row.google_rating === null || row.google_rating === undefined
          ? null
          : Number(row.google_rating);
      let reviewsCount =
        row.google_reviews_count === null ||
        row.google_reviews_count === undefined
          ? 0
          : Number(row.google_reviews_count);

      // Fallback source: latest company_verifications row (if table exists and
      // tradesman row has no Google data yet).
      if (!googlePlaceId || rating == null || !reviewsCount) {
        if (await tableExists("company_verifications")) {
          try {
            const verRows = await mysqlQuery(
              `
              SELECT
                google_place_id,
                google_rating,
                google_reviews_count
              FROM company_verifications
              WHERE company_number = ?
              ORDER BY checked_at DESC, id DESC
              LIMIT 1
            `,
              [row.company_number || null]
            );

            const ver = verRows[0] || null;
            if (ver) {
              if (!googlePlaceId && ver.google_place_id) {
                googlePlaceId = String(ver.google_place_id);
              }
              if (rating == null && ver.google_rating != null) {
                rating = Number(ver.google_rating);
              }
              if (!reviewsCount && ver.google_reviews_count != null) {
                reviewsCount = Number(ver.google_reviews_count);
              }
            }
          } catch (e) {
            console.warn(
              `${TAG} fallback from company_verifications failed:`,
              e?.message || e
            );
          }
        }
      }

      const payload = {
        ok: true,
        tradesmanId: row.id,
        userId: row.user_id,
        companyName: row.company_name,
        companyNumber: row.company_number || null,
        googlePlaceId: googlePlaceId || null,
        rating: rating,
        reviewsCount: reviewsCount || 0,

        // Placeholder for when you later plug in live Google Places data
        reviews: [], // e.g. [{ author, rating, text, time }, ...]
      };

      console.log(
        `${TAG} id=${id} -> placeId=${payload.googlePlaceId || "-"} rating=${
          payload.rating ?? "-"
        } count=${payload.reviewsCount}`
      );

      return res.json(payload);
    } catch (e) {
      console.error(`${TAG} handler error:`, e);
      return res.status(500).json({
        error: "internal_error",
        message: e?.message || String(e),
      });
    }
  });

  if (!ctx.__logged_tradesmen_google_reviews_get) {
    ctx.__logged_tradesmen_google_reviews_get = true;
    console.log(
      "[routes] mounted: GET /tradesmen/:id/google-reviews (google reviews)"
    );
  }
};

// //
// // GET /api/tradesmen/:id/google-reviews
// // Returns the stored Google review metadata (place id, rating, count)
// // for a given tradesman. This is intended to power the builder profile page.
// //
// module.exports = (router, ctx) => {
//   const { db } = ctx;
//   const TAG = "[tradesmen.google-reviews.get]";

//   // Helper: inspect table columns (defensive in case migrations lag)
//   const tblCols = (name) =>
//     new Set(
//       db
//         .prepare(`PRAGMA table_info(${name})`)
//         .all()
//         .map((r) => r.name)
//     );

//   const ensureGoogleCols = () => {
//     const cols = tblCols("tradesmen");
//     if (!cols.has("google_place_id")) {
//       console.warn(
//         `${TAG} tradesmen.google_place_id missing – did you run migration 027?`
//       );
//     }
//     if (!cols.has("google_rating")) {
//       console.warn(
//         `${TAG} tradesmen.google_rating missing – did you run migration 027?`
//       );
//     }
//     if (!cols.has("google_reviews_count")) {
//       console.warn(
//         `${TAG} tradesmen.google_reviews_count missing – did you run migration 027?`
//       );
//     }
//     if (!cols.has("company_number")) {
//       console.warn(
//         `${TAG} tradesmen.company_number missing – some fallbacks may not work`
//       );
//     }
//   };

//   const hasTable = (name) =>
//     !!db
//       .prepare(
//         `SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`
//       )
//       .get(name);

//   ensureGoogleCols();

//   // IMPORTANT: no /api prefix here (added when mounting routers in index.js)
//   router.get("/tradesmen/:id/google-reviews", (req, res) => {
//     const { id } = req.params || {};
//     if (!id) {
//       return res.status(400).json({ error: "id_required" });
//     }

//     // Support both:
//     //  - Firebase uid style user_id (string)
//     //  - numeric tradesmen.id (integer)
//     let numericId = null;
//     if (/^\d+$/.test(String(id))) {
//       numericId = Number(id);
//     }

//     const row = db
//       .prepare(
//         `
//         SELECT
//           id,
//           user_id,
//           company_name,
//           company_number,
//           google_place_id,
//           google_rating,
//           google_reviews_count
//         FROM tradesmen
//         WHERE user_id = @id
//            OR (@numericId IS NOT NULL AND id = @numericId)
//         LIMIT 1
//       `
//       )
//       .get({
//         id: String(id),
//         numericId,
//       });

//     if (!row) {
//       return res.status(404).json({ error: "tradesman_not_found" });
//     }

//     // Primary source: fields stored on tradesmen row
//     let googlePlaceId =
//       row.google_place_id === undefined || row.google_place_id === null
//         ? null
//         : String(row.google_place_id);
//     let rating =
//       row.google_rating === null || row.google_rating === undefined
//         ? null
//         : Number(row.google_rating);
//     let reviewsCount =
//       row.google_reviews_count === null ||
//       row.google_reviews_count === undefined
//         ? 0
//         : Number(row.google_reviews_count);

//     // Fallback source: latest company_verifications row (if table exists and
//     // tradesman row has no Google data yet). This lets older tradesmen pick up
//     // Google metadata without needing a manual backfill.
//     if (
//       (!googlePlaceId || rating == null || !reviewsCount) &&
//       hasTable("company_verifications")
//     ) {
//       try {
//         const ver = db
//           .prepare(
//             `
//             SELECT
//               google_place_id,
//               google_rating,
//               google_reviews_count
//             FROM company_verifications
//             WHERE company_number = @companyNumber
//             ORDER BY checked_at DESC, id DESC
//             LIMIT 1
//           `
//           )
//           .get({
//             companyNumber: row.company_number || null,
//           });

//         if (ver) {
//           if (!googlePlaceId && ver.google_place_id) {
//             googlePlaceId = String(ver.google_place_id);
//           }
//           if (rating == null && ver.google_rating != null) {
//             rating = Number(ver.google_rating);
//           }
//           if (!reviewsCount && ver.google_reviews_count != null) {
//             reviewsCount = Number(ver.google_reviews_count);
//           }
//         }
//       } catch (e) {
//         console.warn(
//           `${TAG} fallback from company_verifications failed:`,
//           e?.message || e
//         );
//       }
//     }

//     const payload = {
//       ok: true,
//       tradesmanId: row.id,
//       userId: row.user_id,
//       companyName: row.company_name,
//       companyNumber: row.company_number || null,
//       googlePlaceId: googlePlaceId || null,
//       rating: rating,
//       reviewsCount: reviewsCount || 0,

//       // Placeholder for when you later plug in live Google Places data
//       reviews: [], // e.g. [{ author, rating, text, time }, ...]
//     };

//     console.log(
//       `${TAG} id=${id} -> placeId=${payload.googlePlaceId || "-"} rating=${
//         payload.rating ?? "-"
//       } count=${payload.reviewsCount}`
//     );

//     return res.json(payload);
//   });

//   if (!ctx.__logged_tradesmen_google_reviews_get) {
//     ctx.__logged_tradesmen_google_reviews_get = true;
//     console.log(
//       "[routes] mounted: GET /tradesmen/:id/google-reviews (google reviews)"
//     );
//   }
// };
