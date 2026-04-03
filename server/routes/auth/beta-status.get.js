/**
 * GET /api/auth/beta-status
 * Returns whether a beta code is required to register.
 * No auth required — called before the user has an account.
 */
module.exports = (router) => {
  router.get("/auth/beta-status", (req, res) => {
    res.json({ required: !!process.env.BETA_CODE });
  });
};
