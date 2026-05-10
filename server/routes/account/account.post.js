/**
 * POST /api/account
 * Auth: required
 * Body: { location, firstName?, lastName?, username? }
 *
 * Only `location` is required from the client. firstName, lastName and
 * username are derived from the Firebase token claims (Google `name` and
 * `email`) when not supplied — the post-OAuth onboarding page only asks the
 * user for their postcode and lets the server fill in the rest. The body
 * fields are still accepted so the email-signup path (which already collects
 * a full profile up front) keeps working unchanged.
 *
 * Username collisions are resolved automatically by appending a numeric
 * suffix (`fresh.user`, `fresh.user1`, …) so the user never sees a
 * "username taken" error during the auto-derived flow.
 *
 * Effect: upsert user fields; updates location tokens.
 * Response: { ok: true }
 */
const { updateUserLocationMysql } = require("../../lib/location");
const { logger, withRequest } = require("../../lib/logger");

const MAX_USERNAME_SUFFIX_TRIES = 100;

function sanitizeUsernameBase(raw) {
  const cleaned = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 20);
  return cleaned || `user${Date.now()}`;
}

async function findUniqueUsername(mysqlQuery, base, uid) {
  let candidate = base;
  for (let suffix = 0; suffix < MAX_USERNAME_SUFFIX_TRIES; suffix += 1) {
    const taken = await mysqlQuery(
      `SELECT 1 FROM users WHERE username = ? AND uid <> ? LIMIT 1`,
      [candidate, uid],
    );
    if (taken.length === 0) return candidate;
    candidate = `${base}${suffix + 1}`;
  }
  // Last-resort fallback if we somehow exhaust the suffix range.
  return `${base}${Date.now()}`;
}

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx");
  }

  router.post("/account", auth, async (req, res) => {
    const log = withRequest(req);
    const uid = req.user.uid;

    const claimName = String(req.user.name || "").trim();
    const claimEmail = String(req.user.email || "").trim();

    let firstName = (req.body?.firstName ?? "").toString().trim();
    let lastName = (req.body?.lastName ?? "").toString().trim();
    let username = (req.body?.username ?? "").toString().trim();
    const location = (req.body?.location ?? "").toString().trim();

    // Only `location` is required from the request body. The rest are
    // derived from the token below if absent.
    if (!location) {
      log.warn({ uid }, "missing required postcode/location");
      return res.status(400).json({
        error: "missing_required_fields",
        message: "Please enter your postcode or city.",
        fieldErrors: { location: "Postcode or city is required." },
      });
    }

    // Derive name from the Google `name` claim when not supplied. Splitting
    // on whitespace handles "First Last", "First Middle Last", and the
    // single-name edge case (lastName ends up empty).
    if (!firstName || !lastName) {
      const parts = claimName.split(/\s+/).filter(Boolean);
      if (!firstName) {
        firstName =
          parts[0] || (claimEmail.split("@")[0] || "User");
      }
      if (!lastName) {
        lastName = parts.slice(1).join(" ") || "";
      }
    }

    try {
      // Username derivation + uniqueness handling.
      if (!username) {
        const base = sanitizeUsernameBase(claimEmail.split("@")[0]);
        username = await findUniqueUsername(mysqlQuery, base, uid);
        log.info({ uid, username }, "auto-generated username from claims");
      } else {
        // Caller-supplied username — surface a collision error to the
        // existing email-signup path, which expects this 409.
        const takenRows = await mysqlQuery(
          `SELECT 1 FROM users WHERE username = ? AND uid <> ? LIMIT 1`,
          [username, uid],
        );
        if (takenRows.length > 0) {
          log.warn({ username, uid }, "username already taken");
          return res.status(409).json({
            error: "username_taken",
            message: "That username is already taken.",
          });
        }
      }

      const email = req.user.email ?? null;

      // Check if user has any notifications — zero means first-time signup.
      // We can't check if the user row exists because /api/auth/signup
      // may have already created it before /api/account runs.
      const notifRows = await mysqlQuery(
        `SELECT COUNT(*) AS c FROM notifications WHERE userId = ?`,
        [uid],
      );
      const isNewUser = Number(notifRows[0]?.c || 0) === 0;

      await mysqlQuery(
        `
        INSERT INTO users (
          uid,
          email,
          createdAt,
          firstName,
          lastName,
          username,
          locationRaw
        )
        VALUES (
          ?, ?, NOW(), ?, ?, ?, ?
        )
        ON DUPLICATE KEY UPDATE
          email       = VALUES(email),
          firstName   = VALUES(firstName),
          lastName    = VALUES(lastName),
          username    = VALUES(username),
          locationRaw = VALUES(locationRaw)
        `,
        [uid, email, firstName, lastName, username, location],
      );

      log.info({ uid }, "upserted user row in MySQL");

      await updateUserLocationMysql(mysqlQuery, uid, location);
      log.info({ uid }, "updated user location tokens");

      res.json({ ok: true });
      ctx.logActivity("account.update", "info", req.user.uid, "Account updated");

      // Removed 2026-05: see signup.post.js for the same change. The
      // "A neighbour near you is looking for help" notifications didn't
      // fit the engagement-first signup flow.

      return;
    } catch (err) {
      logger.error(
        { err: err?.message, uid, body: req.body },
        "Error in POST /api/account",
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
