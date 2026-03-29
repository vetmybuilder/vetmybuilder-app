/**
 * POST /api/account
 * Auth: required
 * Body: { firstName?, lastName?, username?, location? }
 * Effect: upsert user fields; updates location tokens (only when provided)
 * Response: { ok: true }
 */
const { updateUserLocationMysql } = require("../../lib/location");
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx");
  }

  router.post("/account", auth, async (req, res) => {
    const log = withRequest(req);
    const uid = req.user.uid;

    const firstName = (req.body?.firstName ?? "").toString().trim();
    const lastName = (req.body?.lastName ?? "").toString().trim();
    const username = (req.body?.username ?? "").toString().trim();
    const location = (req.body?.location ?? "").toString().trim();

    const fieldErrors = {};
    if (!firstName) fieldErrors.firstName = "First name is required.";
    if (!lastName) fieldErrors.lastName = "Last name is required.";
    if (!username) fieldErrors.username = "Username is required.";
    if (!location) fieldErrors.location = "Postcode or city is required.";

    if (Object.keys(fieldErrors).length > 0) {
      log.warn({ uid, fieldErrors }, "missing required account fields");
      return res.status(400).json({
        error: "missing_required_fields",
        message: "Please fill in all required fields.",
        fieldErrors,
      });
    }

    try {
      // Username uniqueness check (always, because username is now mandatory)
      const takenRows = await mysqlQuery(
        `
        SELECT 1
        FROM users
        WHERE username = ?
          AND uid <> ?
        LIMIT 1
        `,
        [username, uid],
      );

      if (takenRows.length > 0) {
        log.warn({ username, uid }, "username already taken");
        return res.status(409).json({
          error: "username_taken",
          message: "That username is already taken.",
        });
      }

      const email = req.user.email ?? null;

      await mysqlQuery(
        `
        INSERT INTO users (
          uid,
          email,
          createdAt,
          firstName,
          lastName,
          username,
          locationRaw
        )
        VALUES (
          ?, ?, NOW(), ?, ?, ?, ?
        )
        ON DUPLICATE KEY UPDATE
          email       = VALUES(email),
          firstName   = VALUES(firstName),
          lastName    = VALUES(lastName),
          username    = VALUES(username),
          locationRaw = VALUES(locationRaw)
        `,
        [uid, email, firstName, lastName, username, location],
      );

      log.info({ uid }, "upserted user row in MySQL");

      // Location is mandatory now, so this will always run
      await updateUserLocationMysql(mysqlQuery, uid, location);
      log.info({ uid }, "updated user location tokens");

      return res.json({ ok: true });
    } catch (err) {
      logger.error(
        { err: err?.message, uid, body: req.body },
        "Error in POST /api/account",
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
