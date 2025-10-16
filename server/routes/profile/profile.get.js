// server/v2/routes/profile/profile.get.js
/**
 * GET /api/v2/profile  (also /api/profile if mounted there)
 * Auth: required
 * Response: { profile | null }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.get("/profile", auth, (req, res) => {
    const uid = req.user.uid;
    const row = db
      .prepare(
        `SELECT uid AS userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, createdAt AS updatedAt
           FROM users WHERE uid = ?`
      )
      .get(uid);
    return res.json({ profile: row || null });
  });
};
