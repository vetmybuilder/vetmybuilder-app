// server/routes/profile/profile.get.js
/**
 * GET /api/profile  (also /api/profile if mounted there)
 * Auth: required
 * Response: { profile | null }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.get("/profile", auth, async (req, res) => {
    const uid = req.user.uid;

    try {
      const rows = await mysqlQuery(
        `SELECT uid AS userId,
                locationRaw,
                postcode,
                postcodeSector,
                postcodeOutward,
                city,
                createdAt AS updatedAt
           FROM users
          WHERE uid = ?`,
        [uid]
      );

      const row = rows[0] || null;
      return res.json({ profile: row });
    } catch (err) {
      console.error(
        "Error fetching profile from MySQL in /api/v2/profile:",
        err
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};

// // server/routes/profile/profile.get.js
// /**
//  * GET /api/profile  (also /api/profile if mounted there)
//  * Auth: required
//  * Response: { profile | null }
//  */
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;

//   router.get("/profile", auth, (req, res) => {
//     const uid = req.user.uid;
//     const row = db
//       .prepare(
//         `SELECT uid AS userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, createdAt AS updatedAt
//            FROM users WHERE uid = ?`
//       )
//       .get(uid);
//     return res.json({ profile: row || null });
//   });
// };
