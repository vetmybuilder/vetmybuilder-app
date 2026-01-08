/**
 * GET /api/__ch/diag
 * Auth: none (same as monolith diag)
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { chDiag } = ctx;

  router.get("/__ch/diag", (req, res) => {
    const log = withRequest(req).child({ route: "ch.diag" });

    try {
      const diag = chDiag ? chDiag() : null;

      log.info(
        {
          diagPresent: !!chDiag,
          diag,
        },
        "CH diag requested"
      );

      return res.json(diag);
    } catch (err) {
      log.error(
        {
          errMsg: err?.message,
          stack: err?.stack,
        },
        "Failed to run chDiag()"
      );

      return res.status(500).json({ error: "internal_error" });
    }
  });
};
