// server/routes/me/me.get.js
/**
 * GET /api/me
 * Auth: required.
 * Response:
 *  { uid, email, firstName, lastName, username, locationRaw, postcodeOutward, displayName, initials, isTradesman }
 *
 * `isTradesman` is true iff a row exists in `tradesmen` for this uid. The
 * client uses this alongside `postcodeOutward` to decide `profileComplete`:
 * a tradesman-only account (no homeowner postcode) must still be treated
 * as profile-complete, otherwise homeowner-gating logic in AuthedOnly /
 * GuestOnly / SiteHeader will keep bouncing them to /signup/complete.
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery, touchUserMw } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  router.get("/me", auth, touchUserMw, async (req, res) => {
    const log = withRequest(req, logger).child({ route: "GET /api/me" });
    const uid = req.user.uid;

    let row = {};
    let isTradesman = false;
    try {
      const rows = await mysqlQuery(
        `
        SELECT u.uid, u.email, u.firstName, u.lastName, u.username,
               u.locationRaw, u.postcodeOutward,
               (t.user_id IS NOT NULL) AS isTradesman
        FROM users u
        LEFT JOIN tradesmen t ON t.user_id = u.uid
        WHERE u.uid = ?
        LIMIT 1
        `,
        [uid],
      );
      row = rows[0] || {};
      // MySQL returns a 0/1 int for the boolean expression above; normalise
      // to a native bool for the JSON response.
      isTradesman = !!Number(row.isTradesman ?? 0);
    } catch (err) {
      log.error(
        { errMsg: err?.message, stack: err?.stack, uid },
        "MySQL error fetching user in /api/me",
      );
      return res.status(500).json({ error: "internal_error" });
    }

    let email = row.email ?? req.user.email ?? null;
    let firstName = row.firstName ?? null;
    let lastName = row.lastName ?? null;
    let username = row.username ?? null;

    /**
     * 🔒 CRITICAL FIX
     * If user exists but profile fields are missing,
     * hydrate once from Firebase auth.
     */
    const profileMissing = !firstName && !lastName && !username;

    if (profileMissing) {
      const displayName = (req.user.displayName || "").trim();

      let fn = null;
      let ln = null;

      if (displayName) {
        const parts = displayName.split(/\s+/).filter(Boolean);
        fn = parts[0] || null;
        ln = parts.length > 1 ? parts.slice(1).join(" ") : null;
      }

      try {
        await mysqlQuery(
          `
          UPDATE users
          SET
            email = COALESCE(email, ?),
            firstName = ?,
            lastName = ?
          WHERE uid = ?
          `,
          [email, fn, ln, uid],
        );

        firstName = fn;
        lastName = ln;

        log.info(
          { uid, firstName, lastName },
          "Hydrated missing user profile from auth",
        );
      } catch (err) {
        log.error(
          { errMsg: err?.message, uid },
          "Failed to hydrate missing user profile",
        );
      }
    }

    const displayName =
      [firstName, lastName].filter(Boolean).join(" ") ||
      username ||
      email ||
      null;

    // Initials rules:
    // 1) first + last
    // 2) username parts
    // 3) undefined (never UID/email)
    let initials;
    if (firstName || lastName) {
      initials =
        `${(firstName || "")[0] || ""}${(lastName || "")[0] || ""}`.toUpperCase() ||
        undefined;
    } else if (username) {
      initials =
        username
          .split(/[.\-_ ]+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((s) => s[0])
          .join("")
          .toUpperCase() || undefined;
    }

    res.set("Cache-Control", "no-store");
    log.info({ uid }, "Returned /api/me profile");

    res.json({
      uid,
      email,
      firstName,
      lastName,
      username,
      locationRaw: row.locationRaw ?? null,
      postcodeOutward: row.postcodeOutward ?? null,
      isTradesman,
      displayName,
      initials,
    });
  });
};
