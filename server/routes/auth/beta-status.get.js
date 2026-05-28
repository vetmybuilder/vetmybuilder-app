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
    // Traders always stay open so we can build supply ahead of opening
    // homeowner registrations.
    const role = String(req.query?.role || "").toLowerCase();
    if (role === "trader" || role === "tradesman" || role === "tradesperson") {
      return res.json({ required: false, closed: false });
    }

    // Homeowner: the `homeowner_signup` flag is the master switch. When
    // off, signup is closed. When on, the legacy BETA_CODE invite gate
    // (if set) still applies.
    const signupOpen = await isFlagEnabled(mysqlQuery, "homeowner_signup");
    res.json({
      required: signupOpen ? !!process.env.BETA_CODE : true,
      closed: !signupOpen,
    });
  });
};
