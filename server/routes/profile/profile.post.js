// server/routes/profile/profile.post.js
/**
 * POST /api/profile  (also /api/profile if mounted there)
 * Auth: required
 * Body: { location }
 * Effect: updates location tokens on users row (MySQL)
 * Response: { profile }
 */
const { updateUserLocationMysql } = require("../../lib/location");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post("/profile", auth, async (req, res) => {
    const uid = req.user.uid;
    const loc = String(req.body?.location ?? "").trim();

    try {
      // Update locationRaw + postcode + sector + outward + city
      await updateUserLocationMysql(mysqlQuery, uid, loc);

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
      console.error("Error updating profile location (MySQL):", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};


// // server/routes/profile/profile.post.js
// /**
//  * POST /api/profile  (also /api/profile if mounted there)
//  * Auth: required
//  * Body: { location }
//  * Effect: updates location tokens on users row
//  * Response: { profile }
//  */
// module.exports = (router, ctx) => {
//   const { db, auth, updateUserLocation } = ctx;

//   router.post("/profile", auth, (req, res) => {
//     const uid = req.user.uid;
//     const loc = String(req.body?.location ?? "").trim();

//     updateUserLocation(db, uid, loc);

//     const row = db
//       .prepare(
//         `SELECT uid AS userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, createdAt AS updatedAt
//            FROM users WHERE uid = ?`
//       )
//       .get(uid);

//     return res.json({ profile: row });
//   });
// };
