/**
 * POST /api/auth/signup
 *
 * Auth: required (Firebase)
 * Body:
 *  {
 *    firstName: string,
 *    lastName: string,
 *    username?: string,
 *    location?: string
 *  }
 *
 * Guarantees:
 * - users row ALWAYS exists
 * - firstName / lastName NEVER null
 * - safe to call more than once
 */

const { updateUserLocationMysql } = require("../../lib/location");
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post("/auth/signup", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "POST /api/auth/signup",
    });

    const uid = req.user.uid;
    const email = req.user.email ?? null;

    const firstName = (req.body?.firstName || "").trim();
    const lastName = (req.body?.lastName || "").trim();
    const username = (req.body?.username || "").trim() || null;
    const location = (req.body?.location || "").trim() || null;

    if (!firstName || !lastName) {
      return res.status(400).json({
        error: "missing_required_fields",
        message: "firstName and lastName are required",
      });
    }

    try {
      await mysqlQuery(
        `
        INSERT INTO users (
          uid,
          email,
          firstName,
          lastName,
          username,
          locationRaw,
          createdAt
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          email       = VALUES(email),
          firstName   = VALUES(firstName),
          lastName    = VALUES(lastName),
          username    = COALESCE(VALUES(username), username),
          locationRaw = COALESCE(VALUES(locationRaw), locationRaw)
        `,
        [uid, email, firstName, lastName, username, location],
      );

      if (location) {
        await updateUserLocationMysql(mysqlQuery, uid, location);
      }

      log.info({ uid }, "User signup profile ensured");

      return res.json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message, uid }, "Failed to create signup profile");
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
