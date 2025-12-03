// server/routes/me/me.get.js
/**
 * GET /api/me
 * Auth: required (Bearer). Also fine to keep legacy /api/me mounted if you choose.
 * Response:
 *  { uid, email, firstName, lastName, username, displayName, initials }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.get("/me", auth, async (req, res) => {
    const uid = req.user.uid;

    let row = {};
    try {
      const rows = await mysqlQuery(
        `SELECT uid, email, firstName, lastName, username
         FROM users WHERE uid = ?`,
        [uid]
      );
      row = rows[0] || {};
    } catch (err) {
      console.error("Error fetching user from MySQL in /api/me:", err);
      return res.status(500).json({ error: "internal_error" });
    }

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
