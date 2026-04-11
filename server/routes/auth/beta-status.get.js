/**
 * GET /api/auth/beta-status
 * Returns whether a beta code is required to register.
 * No auth required — called before the user has an account.
 */
module.exports = (router) => {
  router.get("/auth/beta-status", (req, res) => {
    // Skip beta gate in test mode — ENABLE_TEST_ROUTES means E2E/dev environment
    const required = !!process.env.BETA_CODE && !process.env.ENABLE_TEST_ROUTES;
    res.json({ required });
  });
};
