// server/v2/routes/__test__/users.post.js

/**
 * POST /api/__test__/users
 * Headers: X-Test-Secret
 * Body: { email, password?, firstName?, lastName?, username?, location?, uid? }
 */
module.exports = (router, ctx) => {
  const {
    assertTestAccess,
    mysqlQuery,
    admin,
    extractLocationTokens,
    crypto = require("crypto"),
  } = ctx;

  router.post("/__test__/users", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    try {
      const {
        uid: incomingUid,
        email,
        password,
        firstName,
        lastName,
        username,
        location = "",
      } = req.body || {};

      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "email is required" });
      }

      let uid = incomingUid;

      // Optionally create a Firebase user when password provided and admin initialized
      if (!uid && admin?.apps?.length && password) {
        try {
          const userRec = await admin.auth().createUser({
            email,
            password,
            emailVerified: true,
          });
          uid = userRec.uid;
        } catch (e) {
          try {
            const existing = await admin.auth().getUserByEmail(email);
            uid = existing.uid;
          } catch (_) {
            console.warn(
              "[test users] Firebase create/get failed",
              e?.message || e
            );
          }
        }
      }

      if (!uid) uid = crypto.randomBytes(16).toString("base64url");

      const now = new Date().toISOString();
      const t = extractLocationTokens(location);

      await mysqlQuery(
        `INSERT INTO users
           (uid, email, createdAt, firstName, lastName, username,
            locationRaw, postcode, postcodeSector, postcodeOutward, city)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email=VALUES(email),
           firstName=VALUES(firstName),
           lastName=VALUES(lastName),
           username=VALUES(username),
           locationRaw=VALUES(locationRaw),
           postcode=VALUES(postcode),
           postcodeSector=VALUES(postcodeSector),
           postcodeOutward=VALUES(postcodeOutward),
           city=VALUES(city)`,
        [
          uid,
          email,
          now,
          firstName ?? null,
          lastName ?? null,
          username ?? null,
          t.raw,
          t.full,
          t.sector,
          t.outward,
          t.city,
        ]
      );

      res.status(201).json({
        ok: true,
        uid,
        email,
        createdFirebase: Boolean(password && admin?.apps?.length),
      });
    } catch (e) {
      console.error("[test users] create error", e);
      res.status(500).json({ error: "Failed to create user" });
    }
  });
};
