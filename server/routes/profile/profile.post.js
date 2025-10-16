// server/v2/routes/profile/profile.post.js
/**
 * POST /api/v2/profile  (also /api/profile if mounted there)
 * Auth: required
 * Body: { location }
 * Effect: updates location tokens on users row
 * Response: { profile }
 */
module.exports = (router, ctx) => {
  const { db, auth, updateUserLocation } = ctx;

  router.post("/profile", auth, (req, res) => {
    const uid = req.user.uid;
    const loc = String(req.body?.location ?? "").trim();

    updateUserLocation(db, uid, loc);

    const row = db
      .prepare(
        `SELECT uid AS userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, createdAt AS updatedAt
           FROM users WHERE uid = ?`
      )
      .get(uid);

    return res.json({ profile: row });
  });
};
