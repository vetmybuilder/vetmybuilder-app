// server/routes/recommendations/verification.get.js
/**
 * GET /api/recommendations/:id/verification
 * Auth: required
 * Response: {
 *   verification: {
 *     recommendationId,
 *     status,
 *     companyNumber,
 *     companyName,
 *     score,
 *     sicCodes,
 *     checkedAt,
 *     errorMessage,
 *     // Google extras (may be null):
 *     googlePlaceId,
 *     googleRating,
 *     googleReviewsCount
 *   }
 * }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const TAG = "[recommendations.verification.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // googlePlaces helper: server/lib/googlePlaces.js
  let lookupBusiness;
  try {
    ({ lookupBusiness } = require("../../lib/googlePlaces"));
  } catch (e) {
    console.warn(
      `${TAG} googlePlaces helper not available, skipping Google lookup`
    );
  }

  // ---- feature-detect google_* columns on tradesmen (once, with cache) ----
  let hasGoogleColsCache = null;
  async function hasGoogleCols() {
    if (hasGoogleColsCache !== null) return hasGoogleColsCache;
    try {
      const rows = await mysqlQuery(
        `SHOW COLUMNS FROM tradesmen LIKE 'google_place_id'`
      );
      hasGoogleColsCache = Array.isArray(rows) && rows.length > 0;
    } catch {
      hasGoogleColsCache = false;
    }
    if (!hasGoogleColsCache) {
      console.warn(
        `${TAG} tradesmen.google_place_id not found – Google data will not be cached in DB`
      );
    }
    return hasGoogleColsCache;
  }

  router.get("/recommendations/:id/verification", auth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "Bad id" });
      }

      const hasGoogle = await hasGoogleCols();

      let rows;
      if (hasGoogle) {
        // Full join including google_* columns
        rows = await mysqlQuery(
          `
          SELECT
            cv.recommendationId,
            cv.status,
            cv.companyNumber,
            cv.companyName,
            cv.score,
            cv.sicCodes,
            cv.checkedAt,
            cv.errorMessage,

            -- From tradesmen (may be NULL if no matching registered tradesman)
            t.user_id              AS tradesmanUserId,
            t.google_place_id      AS googlePlaceId,
            t.google_rating        AS googleRating,
            t.google_reviews_count AS googleReviewsCount
          FROM company_verifications AS cv
          LEFT JOIN tradesmen AS t
            ON t.company_number = cv.companyNumber
          WHERE cv.recommendationId = ?
          LIMIT 1
        `,
          [id]
        );
      } else {
        // No google_* columns – still return CH info, but Google fields start null
        rows = await mysqlQuery(
          `
          SELECT
            cv.recommendationId,
            cv.status,
            cv.companyNumber,
            cv.companyName,
            cv.score,
            cv.sicCodes,
            cv.checkedAt,
            cv.errorMessage,
            NULL AS tradesmanUserId,
            NULL AS googlePlaceId,
            NULL AS googleRating,
            NULL AS googleReviewsCount
          FROM company_verifications AS cv
          WHERE cv.recommendationId = ?
          LIMIT 1
        `,
          [id]
        );
      }

      const row = rows[0];

      if (!row) {
        return res.json({
          verification: { recommendationId: id, status: "queued" },
        });
      }

      let sicCodes = [];
      try {
        sicCodes = row.sicCodes ? JSON.parse(row.sicCodes) : [];
      } catch {
        // ignore parse errors
      }

      // Start with whatever is already cached on the tradesmen row (if any)
      let googlePlaceId = row.googlePlaceId || null;
      let googleRating =
        row.googleRating === null || row.googleRating === undefined
          ? null
          : Number(row.googleRating);
      let googleReviewsCount = Number(row.googleReviewsCount || 0);

      // Lazy enrichment using verified CH name -> Google Places
      if (!googlePlaceId && row.companyName && lookupBusiness) {
        try {
          const locationHint = null; // can be refined later

          const match = await lookupBusiness({
            name: row.companyName,
            locationHint,
            companyNumber: row.companyNumber,
          });

          if (match && match.placeId) {
            googlePlaceId = match.placeId;
            googleRating =
              match.rating === undefined || match.rating === null
                ? null
                : Number(match.rating);
            googleReviewsCount = Number(match.userRatingsTotal || 0);

            // Cache into tradesmen only if those columns exist
            if (hasGoogle) {
              try {
                await mysqlQuery(
                  `
                  UPDATE tradesmen
                     SET google_place_id = ?,
                         google_rating = ?,
                         google_reviews_count = ?
                   WHERE company_number = ?
                `,
                  [
                    googlePlaceId,
                    googleRating,
                    googleReviewsCount,
                    row.companyNumber,
                  ]
                );
              } catch (e) {
                console.warn(
                  `${TAG} failed to cache Google data into tradesmen:`,
                  e?.message || e
                );
              }
            }
          }
        } catch (e) {
          console.warn(
            `${TAG} google lookup failed for company "${row.companyName}":`,
            e?.message || e
          );
        }
      }

      const payload = {
        verification: {
          recommendationId: row.recommendationId,
          status: row.status,
          companyNumber: row.companyNumber,
          companyName: row.companyName,
          score: row.score,
          sicCodes,
          checkedAt: row.checkedAt,
          errorMessage: row.errorMessage || null,
          googlePlaceId,
          googleRating,
          googleReviewsCount,
        },
      };

      console.log(
        `${TAG} recId=${id} -> status=${payload.verification.status} ` +
          `company=${payload.verification.companyNumber || "-"} ` +
          `google={placeId:${payload.verification.googlePlaceId || "-"}, ` +
          `rating:${googleRating ?? "-"}, count:${googleReviewsCount}}`
      );

      return res.json(payload);
    } catch (e) {
      console.error(`${TAG} error:`, e?.message || e);
      return res
        .status(500)
        .json({ error: "Internal error loading verification" });
    }
  });
};

// // server/routes/recommendations/verification.get.js
// /**
//  * GET /api/recommendations/:id/verification
//  * Auth: required
//  * Response: {
//  *   verification: {
//  *     recommendationId,
//  *     status,
//  *     companyNumber,
//  *     companyName,
//  *     score,
//  *     sicCodes,
//  *     checkedAt,
//  *     errorMessage,
//  *     // NEW:
//  *     googlePlaceId,
//  *     googleRating,
//  *     googleReviewsCount
//  *   }
//  * }
//  */
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;
//   const TAG = "[recommendations.verification.get]";

//   // googlePlaces helper: server/lib/googlePlaces.js
//   let lookupBusiness;
//   try {
//     ({ lookupBusiness } = require("../../lib/googlePlaces"));
//   } catch (e) {
//     console.warn(
//       `${TAG} googlePlaces helper not available, skipping Google lookup`
//     );
//   }

//   router.get("/recommendations/:id/verification", auth, async (req, res) => {
//     const id = parseInt(req.params.id, 10);
//     if (!Number.isFinite(id)) {
//       return res.status(400).json({ error: "Bad id" });
//     }

//     // Join company_verifications to tradesmen via Companies House number
//     const row = db
//       .prepare(
//         `
//         SELECT
//           cv.recommendationId,
//           cv.status,
//           cv.companyNumber,
//           cv.companyName,
//           cv.score,
//           cv.sicCodes,
//           cv.checkedAt,
//           cv.errorMessage,

//           -- From tradesmen (may be NULL if no matching registered tradesman)
//           t.user_id                AS tradesmanUserId,
//           t.google_place_id        AS googlePlaceId,
//           t.google_rating          AS googleRating,
//           t.google_reviews_count   AS googleReviewsCount
//         FROM company_verifications AS cv
//         LEFT JOIN tradesmen AS t
//           ON t.company_number = cv.companyNumber
//         WHERE cv.recommendationId = ?
//       `
//       )
//       .get(id);

//     if (!row) {
//       return res.json({
//         verification: { recommendationId: id, status: "queued" },
//       });
//     }

//     let sicCodes = [];
//     try {
//       sicCodes = row.sicCodes ? JSON.parse(row.sicCodes) : [];
//     } catch {
//       // ignore parse errors
//     }

//     // Start with whatever is already cached on the tradesmen row
//     let googlePlaceId = row.googlePlaceId || null;
//     let googleRating =
//       row.googleRating === null || row.googleRating === undefined
//         ? null
//         : Number(row.googleRating);
//     let googleReviewsCount = Number(row.googleReviewsCount || 0);

//     // Lazy enrichment using verified CH name -> Google Places
//     if (!googlePlaceId && row.companyName && lookupBusiness) {
//       try {
//         const locationHint = null; // can be improved later

//         const match = await lookupBusiness({
//           name: row.companyName,
//           locationHint,
//           companyNumber: row.companyNumber,
//         });

//         if (match && match.placeId) {
//           googlePlaceId = match.placeId;
//           googleRating =
//             match.rating === undefined || match.rating === null
//               ? null
//               : Number(match.rating);
//           googleReviewsCount = Number(match.userRatingsTotal || 0);

//           // Cache into tradesmen for future calls
//           try {
//             db.prepare(
//               `
//               UPDATE tradesmen
//                  SET google_place_id = ?,
//                      google_rating = ?,
//                      google_reviews_count = ?
//                WHERE company_number = ?
//             `
//             ).run(
//               googlePlaceId,
//               googleRating,
//               googleReviewsCount,
//               row.companyNumber
//             );
//           } catch (e) {
//             console.warn(
//               `${TAG} failed to cache Google data into tradesmen:`,
//               e?.message || e
//             );
//           }
//         }
//       } catch (e) {
//         console.warn(
//           `${TAG} google lookup failed for company "${row.companyName}":`,
//           e?.message || e
//         );
//       }
//     }

//     const payload = {
//       verification: {
//         recommendationId: row.recommendationId,
//         status: row.status,
//         companyNumber: row.companyNumber,
//         companyName: row.companyName,
//         score: row.score,
//         sicCodes,
//         checkedAt: row.checkedAt,
//         errorMessage: row.errorMessage || null,
//         googlePlaceId,
//         googleRating,
//         googleReviewsCount,
//       },
//     };

//     console.log(
//       `${TAG} recId=${id} -> status=${payload.verification.status} ` +
//         `company=${payload.verification.companyNumber || "-"} ` +
//         `google={placeId:${payload.verification.googlePlaceId || "-"}, ` +
//         `rating:${googleRating ?? "-"}, count:${googleReviewsCount}}`
//     );

//     return res.json(payload);
//   });
// };
