/**
 * GET /api/auth/beta-status
 * Returns whether a beta code is required to register.
 * No auth required — called before the user has an account.
 */
module.exports = (router) => {
  router.get("/auth/beta-status", (req, res) => {
    // Pre-launch: the beta gate is homeowner-only. Trader signups stay
    // open via email and SSO so we can build supply ahead of opening
    // homeowner registrations. Callers pass ?role=; missing or unknown
    // roles fall back to the homeowner (gated) path so older clients
    // keep their previous behaviour.
    const role = String(req.query?.role || "").toLowerCase();
    if (role === "trader" || role === "tradesman" || role === "tradesperson") {
      return res.json({ required: false });
    }
    res.json({ required: !!process.env.BETA_CODE });
  });
};
