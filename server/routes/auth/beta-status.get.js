/**
 * GET /api/auth/beta-status
 * Returns whether a beta code is required to register, and whether
 * homeowner signup is closed entirely.
 * No auth required — called before the user has an account.
 *
 *   required: a beta access code must be supplied to register
 *   closed:   homeowner signup is switched off (feature flag) - no signup
 *             at all, even with a code
 */
const { isFlagEnabled } = require("../../lib/featureFlags");

module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;

  router.get("/auth/beta-status", async (req, res) => {
    const role = String(req.query?.role || "").toLowerCase();
    const isTrader =
      role === "trader" || role === "tradesman" || role === "tradesperson";

    // Beta access code is gated by a per-role admin flag, both default
    // off. The actual code value lives in BETA_CODE env; if the flag is
    // on but BETA_CODE is missing, the gate still trips (no provided
    // code can match) so a misconfigured prod doesn't silently leak.
    const betaCodeFlag = isTrader ? "beta_code_trader" : "beta_code_homeowner";
    const betaCodeRequired = await isFlagEnabled(mysqlQuery, betaCodeFlag);

    if (isTrader) {
      // Traders stay open (no homeowner_signup closed-gate) so we can
      // build supply ahead of opening homeowner registrations.
      return res.json({
        required: betaCodeRequired,
        closed: false,
      });
    }

    // Homeowner: the `homeowner_signup` flag is the master switch.
    const signupOpen = await isFlagEnabled(mysqlQuery, "homeowner_signup");
    res.json({
      required: signupOpen ? betaCodeRequired : true,
      closed: !signupOpen,
    });
  });
};
