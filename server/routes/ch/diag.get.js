// server/v2/routes/ch/diag.get.js
/**
 * GET /api/v2/__ch/diag
 * Auth: none (same as monolith diag)
 */
module.exports = (router, ctx) => {
  const { chDiag } = ctx;
  router.get("/__ch/diag", (_req, res) => {
    res.json(chDiag());
  });
};
