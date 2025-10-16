// server/v2/routes/account/account.post.js
/**
 * POST /api/v2/account  (also /api/account if mounted there)
 * Auth: required
 * Body: { firstName?, lastName?, username?, location? }
 * Effect: upsert user fields; updates location tokens
 * Response: { ok: true }
 */
module.exports = (router, ctx) => {
  const { db, auth, updateUserLocation } = ctx;

  router.post("/account", auth, (req, res) => {
    const uid = req.user.uid;

    const firstName = (req.body?.firstName ?? "").toString().trim() || null;
    const lastName = (req.body?.lastName ?? "").toString().trim() || null;
    const username = (req.body?.username ?? "").toString().trim() || null;
    const location = (req.body?.location ?? "").toString();

    if (username) {
      const taken = db
        .prepare(`SELECT 1 FROM users WHERE username = ? AND uid <> ?`)
        .get(username, uid);
      if (taken) {
        return res
          .status(409)
          .json({ error: "That username is already taken." });
      }
    }

    const existing = db
      .prepare(`SELECT email, createdAt FROM users WHERE uid = ?`)
      .get(uid);

    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (uid, email, createdAt, firstName, lastName, username)
       VALUES (@uid, @email, @createdAt, @firstName, @lastName, @username)
       ON CONFLICT(uid) DO UPDATE SET
         email=excluded.email,
         firstName=excluded.firstName,
         lastName=excluded.lastName,
         username=excluded.username`
    ).run({
      uid,
      email: existing?.email ?? req.user.email ?? null,
      createdAt: existing?.createdAt ?? now,
      firstName,
      lastName,
      username,
    });

    updateUserLocation(db, uid, location);
    return res.json({ ok: true });
  });
};
