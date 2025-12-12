// server/routes/profile/profile.post.js
/**
 * POST /api/profile
 * Auth: required
 * Body: { location }
 * Effect: updates location tokens on users row (MySQL)
 * Response: { profile }
 */

const { updateUserLocationMysql } = require("../../lib/location");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // structured logger
  const { logger, withRequest } = require("../../lib/logger");

  router.post("/profile", auth, async (req, res) => {
    const uid = req.user?.uid;
    const loc = String(req.body?.location ?? "").trim();

    const log = withRequest(req, logger).child({
      route: "/profile",
      action: "update_location",
      uid,
    });

    if (!uid) {
      log.warn("Missing uid in authenticated POST /profile");
      return res.status(401).json({ error: "unauthorized" });
    }

    log.info({ locationProvided: loc !== "" }, "Profile update received");

    try {
      // Update location fields in MySQL
      await updateUserLocationMysql(mysqlQuery, uid, loc);

      // Reload updated profile
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

      log.info(
        { updated: !!profile, locationRaw: profile?.locationRaw },
        "Profile location updated successfully"
      );

      return res.json({ profile });
    } catch (err) {
      log.error(
        {
          error: err?.message,
          stack: err?.stack,
          location: loc,
          uid,
        },
        "Error updating profile location"
      );

      return res.status(500).json({ error: "internal_error" });
    }
  });
};
