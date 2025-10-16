// server/v2/routes/account/account.get.js
/**
 * GET /api/account
 * Auth: required (Bearer). Also runs touchUser to upsert the user row.
 * Response: { user, profile }
 */
module.exports = (router, ctx) => {
  const { db, auth, touchUserMw } = ctx;

  router.get("/account", auth, touchUserMw, (req, res) => {
    const uid = req.user.uid;

    const user =
      db
        .prepare(
          `SELECT uid, email, firstName, lastName, username,
                  locationRaw, postcode, postcodeSector, postcodeOutward, city
           FROM users
           WHERE uid = ?`
        )
        .get(uid) || null;

    const profile =
      db
        .prepare(
          `SELECT uid AS userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, createdAt AS updatedAt
           FROM users WHERE uid = ?`
        )
        .get(uid) || null;

    res.json({ user, profile });
  });
};
