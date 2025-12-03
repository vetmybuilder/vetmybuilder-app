// server/routes/account/account.post.js
/**
 * POST /api/account
 * Auth: required
 * Body: { firstName?, lastName?, username?, location? }
 * Effect: upsert user fields; updates location tokens
 * Response: { ok: true }
 */
const { updateUserLocationMysql } = require("../../lib/location");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx");
  }

  router.post("/account", auth, async (req, res) => {
    const uid = req.user.uid;

    const firstName = (req.body?.firstName ?? "").toString().trim() || null;
    const lastName = (req.body?.lastName ?? "").toString().trim() || null;
    const username = (req.body?.username ?? "").toString().trim() || null;
    const location = (req.body?.location ?? "").toString().trim() || "";

    try {
      // 1) Enforce username uniqueness
      if (username) {
        const takenRows = await mysqlQuery(
          `SELECT 1
             FROM users
            WHERE username = ?
              AND uid <> ?
            LIMIT 1`,
          [username, uid]
        );

        if (takenRows.length > 0) {
          return res
            .status(409)
            .json({ error: "That username is already taken." });
        }
      }

      // 2) Check for existing user row
      const existingRows = await mysqlQuery(
        `SELECT email, createdAt
           FROM users
          WHERE uid = ?`,
        [uid]
      );
      const existing = existingRows[0] || null;

      const email = existing?.email ?? req.user.email ?? null;

      if (!existing) {
        // 3a) Insert new user – let MySQL set createdAt via NOW()
        await mysqlQuery(
          `INSERT INTO users (
             uid,
             email,
             createdAt,
             firstName,
             lastName,
             username,
             locationRaw
           ) VALUES (
             ?, ?, NOW(), ?, ?, ?, ?
           )`,
          [
            uid,
            email,
            firstName,
            lastName,
            username,
            location || null,
          ]
        );
      } else {
        // 3b) Update existing user (preserve createdAt)
        await mysqlQuery(
          `UPDATE users
              SET email      = ?,
                  firstName  = ?,
                  lastName   = ?,
                  username   = ?,
                  locationRaw = ?
            WHERE uid = ?`,
          [email, firstName, lastName, username, location || null, uid]
        );
      }

      // 4) Update postcode / sector / outward / city based on this location
      await updateUserLocationMysql(mysqlQuery, uid, location);

      return res.json({ ok: true });
    } catch (err) {
      console.error("Error in /api/account (MySQL):", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};