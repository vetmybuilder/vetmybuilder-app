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

    const firstName = (req.body?.firstName ?? "").toString().trim() || null;
    const lastName = (req.body?.lastName ?? "").toString().trim() || null;
    const username = (req.body?.username ?? "").toString().trim() || null;
    const location = (req.body?.location ?? "").toString().trim() || null;

    try {
      const existing = await mysqlQuery(
        `
        SELECT firstName, lastName, username
        FROM users
        WHERE uid = ?
        LIMIT 1
        `,
        [uid],
      );

      const row = existing[0] || null;
      const hasProfile =
        !!String(row?.firstName || "").trim() ||
        !!String(row?.lastName || "").trim() ||
        !!String(row?.username || "").trim();

      if (!hasProfile) {
        if (!firstName || !lastName) {
          log.warn({ uid }, "missing name fields for new profile");
          return res.status(400).json({
            error: "missing_profile_fields",
            message: "First name and last name are required.",
          });
        }
      }

      if (username) {
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
          log.warn({ username }, "username already taken");
          return res
            .status(409)
            .json({ error: "That username is already taken." });
        }
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
          firstName   = COALESCE(VALUES(firstName), firstName),
          lastName    = COALESCE(VALUES(lastName), lastName),
          username    = COALESCE(VALUES(username), username),
          locationRaw = COALESCE(VALUES(locationRaw), locationRaw)
        `,
        [uid, email, firstName, lastName, username, location],
      );

      log.info({ uid }, "upserted user row in MySQL");

      if (location) {
        await updateUserLocationMysql(mysqlQuery, uid, location);
        log.info({ uid }, "updated user location tokens");
      }

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
