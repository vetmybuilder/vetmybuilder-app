// server/routes/recommendations/verification.get.js
/**
 * GET /api/recommendations/:id/verification
 * Auth: required
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[recommendations.verification.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // googlePlaces helper
  let lookupBusiness;
  try {
    ({ lookupBusiness } = require("../../lib/googlePlaces"));
  } catch (e) {
    log.warn?.(
      `${TAG} googlePlaces helper not available, skipping Google lookup`
    );
  }

  // ---- feature-detect google_* columns on tradesmen (cached) ----
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
      log.warn?.(
        `${TAG} tradesmen.google_place_id not found – Google data will not be cached`
      );
    }

    return hasGoogleColsCache;
  }

  router.get("/recommendations/:id/verification", auth, async (req, res) => {
    const id = Number(req.params.id);
    log.info?.(`${TAG} start`, { id });

    try {
      if (!Number.isFinite(id)) {
        log.warn?.(`${TAG} bad id`, { id: req.params.id });
        return res.status(400).json({ error: "Bad id" });
      }

      const hasGoogle = await hasGoogleCols();

      // ---- Main fetch ----
      let rows;
      try {
        if (hasGoogle) {
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
      } catch (err) {
        log.error?.(`${TAG} fetch failed`, { error: err?.message });
        return res.status(500).json({ error: "internal_error" });
      }

      const row = rows?.[0];
      if (!row) {
        log.info?.(`${TAG} no verification yet`, { id });
        return res.json({
          verification: { recommendationId: id, status: "queued" },
        });
      }

      // ---- Parse SIC codes ----
      let sicCodes = [];
      try {
        sicCodes = row.sicCodes ? JSON.parse(row.sicCodes) : [];
      } catch {
        log.warn?.(`${TAG} failed to parse sicCodes`, { id });
      }

      // ---- Google fields (cached or fresh lookup) ----
      let googlePlaceId = row.googlePlaceId || null;
      let googleRating =
        row.googleRating === null || row.googleRating === undefined
          ? null
          : Number(row.googleRating);
      let googleReviewsCount = Number(row.googleReviewsCount || 0);

      // Fresh lookup if needed
      if (!googlePlaceId && row.companyName && lookupBusiness) {
        log.info?.(`${TAG} google lookup`, {
          companyName: row.companyName,
          companyNumber: row.companyNumber,
        });

        try {
          const match = await lookupBusiness({
            name: row.companyName,
            locationHint: null,
            companyNumber: row.companyNumber,
          });

          if (match?.placeId) {
            googlePlaceId = match.placeId;
            googleRating =
              match.rating === undefined || match.rating === null
                ? null
                : Number(match.rating);
            googleReviewsCount = Number(match.userRatingsTotal || 0);

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

                log.info?.(`${TAG} cached Google data`, {
                  companyNumber: row.companyNumber,
                  googlePlaceId,
                });
              } catch (cacheErr) {
                log.warn?.(`${TAG} cache write failed`, {
                  error: cacheErr?.message,
                });
              }
            }
          }
        } catch (lookupErr) {
          log.warn?.(`${TAG} google lookup failed`, {
            error: lookupErr?.message,
          });
        }
      }

      // ---- Build response ----
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

      log.info?.(`${TAG} success`, {
        id,
        status: payload.verification.status,
        company: payload.verification.companyNumber,
      });

      return res.json(payload);
    } catch (e) {
      log.error?.(`${TAG} fatal`, { error: e?.message });
      return res.status(500).json({
        error: "Internal error loading verification",
      });
    }
  });
};
