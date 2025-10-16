// server/v2/routes/me/me.get.js
/**
 * GET /api/v2/me
 * Auth: required (Bearer). Also fine to keep legacy /api/me mounted if you choose.
 * Response:
 *  { uid, email, firstName, lastName, username, displayName, initials }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  router.get("/me", auth, (req, res) => {
    const uid = req.user.uid;

    const row =
      db
        .prepare(
          `SELECT uid, email, firstName, lastName, username
           FROM users WHERE uid = ?`
        )
        .get(uid) || {};

    const email = row.email || req.user.email || null;
    const firstName = row.firstName || null;
    const lastName = row.lastName || null;
    const username = row.username || null;

    const displayName =
      [firstName, lastName].filter(Boolean).join(" ") ||
      username ||
      email ||
      uid;

    const initials =
      firstName || lastName
        ? `${(firstName || "").slice(0, 1)}${(lastName || "").slice(
            0,
            1
          )}`.toUpperCase()
        : username
        ? username
            .split(/[.\-_ ]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s[0])
            .join("")
            .toUpperCase()
        : undefined;

    res.set("Cache-Control", "no-store");
    res.json({
      uid,
      email,
      firstName,
      lastName,
      username,
      displayName,
      initials,
    });
  });
};
