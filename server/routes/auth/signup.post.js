/**
 * POST /api/auth/signup
 *
 * Auth: required (Firebase)
 * Body:
 *  {
 *    firstName: string,
 *    lastName: string,
 *    username?: string,
 *    location?: string
 *  }
 *
 * Guarantees:
 * - users row ALWAYS exists
 * - firstName / lastName NEVER null
 * - safe to call more than once
 */

const { updateUserLocationMysql } = require("../../lib/location");
const { logger, withRequest } = require("../../lib/logger");
const analytics = require("../../lib/analytics");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, admin } = ctx;

  router.post("/auth/signup", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "POST /api/auth/signup",
    });

    const uid = req.user.uid;
    let email = req.user.email ?? null;

    // Custom-token sign-in doesn't always carry email in the ID token.
    // Fall back to Firebase Auth to fetch it so email-based lookups work.
    if (!email && admin) {
      try {
        const userRecord = await admin.auth().getUser(uid);
        email = userRecord.email ?? null;
      } catch (_) {
        // best-effort only
      }
    }

    const firstName = (req.body?.firstName || "").trim();
    const lastName = (req.body?.lastName || "").trim();
    const username = (req.body?.username || "").trim() || null;
    const location = (req.body?.location || "").trim() || null;

    if (!firstName || !lastName) {
      return res.status(400).json({
        error: "missing_required_fields",
        message: "firstName and lastName are required",
      });
    }

    try {
      await mysqlQuery(
        `
        INSERT INTO users (
          uid,
          email,
          firstName,
          lastName,
          username,
          locationRaw,
          createdAt
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          email       = COALESCE(VALUES(email), email),
          firstName   = VALUES(firstName),
          lastName    = VALUES(lastName),
          username    = COALESCE(VALUES(username), username),
          locationRaw = COALESCE(VALUES(locationRaw), locationRaw)
        `,
        [uid, email, firstName, lastName, username, location],
      );

      if (location) {
        await updateUserLocationMysql(mysqlQuery, uid, location);
      }

      log.info({ uid }, "User signup profile ensured");

      res.json({ ok: true });
      analytics.trackSignup(uid, { method: "firebase", role: "homeowner", email });
      ctx.logActivity("auth.signup", "info", uid, `New user: ${email}`);

      // Removed 2026-05: previously fired up to 5 "A neighbour near you
      // is looking for help with X" notifications on signup to surface
      // local activity. The new engagement-first flow doesn't ask
      // homeowners to recommend tradespeople for other people's jobs,
      // so this just spammed the activity feed of someone who just
      // wanted to post their own job. Helper is kept in
      // server/lib/notifyNewSignupOfLocalProjects.js for now in case
      // we re-introduce a similar prompt with different framing.

      return;
    } catch (err) {
      log.error({ err: err?.message, uid }, "Failed to create signup profile");
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
