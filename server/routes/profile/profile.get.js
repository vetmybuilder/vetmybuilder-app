// server/routes/profile/profile.get.js
/**
 * GET /api/profile
 * Auth: required
 * Response: { profile | null }
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // structured logger
  const { logger, withRequest } = require("../../lib/logger");

  router.get("/profile", auth, async (req, res) => {
    const log = withRequest(req, logger).child({ route: "/profile" });
    const uid = req.user?.uid;

    if (!uid) {
      log.warn("Missing uid in authenticated request");
      return res.status(401).json({ error: "unauthorized" });
    }

    log.info({ uid }, "Profile request received");

    try {
      const rows = await mysqlQuery(
        `
        SELECT
          uid AS userId,
          locationRaw,
          postcode,
          postcodeSector,
          postcodeOutward,
          city,
          createdAt AS updatedAt
        FROM users
        WHERE uid = ?
        `,
        [uid]
      );

      const profile = rows[0] || null;

      log.info({ uid, hasProfile: !!profile }, "Profile query completed");

      return res.json({ profile });
    } catch (err) {
      log.error(
        { uid, error: err?.message, stack: err?.stack },
        "Failed to fetch profile"
      );

      return res.status(500).json({ error: "internal_error" });
    }
  });
};
