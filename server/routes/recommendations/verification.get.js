// server/v2/routes/recommendations/verification.get.js
/**
 * GET /api/v2/recommendations/:id/verification
 * Auth: required
 * Response: { verification: {...} }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.get("/recommendations/:id/verification", auth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Bad id" });
    }

    const row = db
      .prepare(
        `SELECT recommendationId, status, companyNumber, companyName, score, sicCodes, checkedAt, errorMessage
           FROM company_verifications
          WHERE recommendationId = ?`
      )
      .get(id);

    if (!row) {
      return res.json({
        verification: { recommendationId: id, status: "queued" },
      });
    }

    let sicCodes = [];
    try {
      sicCodes = row.sicCodes ? JSON.parse(row.sicCodes) : [];
    } catch {}

    return res.json({
      verification: {
        recommendationId: row.recommendationId,
        status: row.status,
        companyNumber: row.companyNumber,
        companyName: row.companyName,
        score: row.score,
        sicCodes,
        checkedAt: row.checkedAt,
        errorMessage: row.errorMessage || null,
      },
    });
  });
};
