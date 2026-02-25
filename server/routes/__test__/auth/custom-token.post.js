// server/routes/__test__/auth/custom-token.post.js

/**
 * POST /api/__test__/auth/custom-token
 * Headers: X-Test-Secret
 * Body: {
 *   uid: string,
 *   email?: string,
 *   password?: string,
 *   displayName?: string
 * }
 *
 * Behavior:
 * - Ensures a Firebase Auth user exists for `uid`.
 * - If email/password/displayName are provided, creates or updates the Auth user with those fields.
 * - Returns a fresh custom token (also aliased as `token` for compatibility).
 */
module.exports = (router, ctx) => {
  const { assertTestAccess, admin } = ctx;

  const log = ctx.log || ctx.logger || console;
  const TAG = "[test/auth/custom-token.post]";
  const ROUTE = "/__test__/auth/custom-token";

  function asTrimmedString(v) {
    const s = String(v ?? "").trim();
    return s || null;
  }

  router.post(ROUTE, async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const body = req.body || {};

    const uid = asTrimmedString(body.uid);
    const email = asTrimmedString(body.email);
    const displayName = asTrimmedString(body.displayName);
    const passwordRaw = body.password == null ? null : String(body.password);

    if (!uid) return res.status(400).json({ error: "uid is required" });

    // Firebase requires at least 6 chars for password if set
    if (passwordRaw && passwordRaw.length < 6) {
      return res
        .status(400)
        .json({ error: "password must be at least 6 characters" });
    }

    if (!admin?.apps?.length) {
      log.error?.(`${TAG} firebase admin not initialised`);
      return res.status(503).json({ error: "firebase admin not initialised" });
    }

    const auth = admin.auth();

    try {
      log.info?.(
        { uid, email, hasPassword: !!passwordRaw, displayName },
        `${TAG} hit`,
      );

      // 1) Lookup user; create if missing; otherwise update with provided fields.
      let userRecord = null;

      try {
        userRecord = await auth.getUser(uid);
      } catch (e) {
        const code = e?.code || "";
        const msg = String(e?.message || "");
        const isNotFound =
          code === "auth/user-not-found" ||
          msg.toLowerCase().includes("no user record") ||
          msg.toLowerCase().includes("user not found");

        if (!isNotFound) throw e;
      }

      if (!userRecord) {
        const createArgs = { uid };

        if (email) createArgs.email = email;
        if (passwordRaw) createArgs.password = passwordRaw;
        if (displayName) createArgs.displayName = displayName;

        userRecord = await auth.createUser(createArgs);
      } else {
        const updateArgs = {};

        if (email && userRecord.email !== email) updateArgs.email = email;
        if (passwordRaw) updateArgs.password = passwordRaw;
        if (displayName && userRecord.displayName !== displayName) {
          updateArgs.displayName = displayName;
        }

        if (Object.keys(updateArgs).length > 0) {
          userRecord = await auth.updateUser(uid, updateArgs);
        }
      }

      // 2) Mint fresh custom token
      const customToken = await auth.createCustomToken(uid);

      // 3) Respond (keep both fields for compatibility)
      return res.json({
        ok: true,
        uid,
        email: userRecord?.email ?? null,
        displayName: userRecord?.displayName ?? null,
        customToken,
        token: customToken, // alias for callers expecting `token`
      });
    } catch (e) {
      const code = e?.code || "unknown";
      const message = String(e?.message || e);

      log.error?.({ uid, code, message }, `${TAG} failed`);

      // Some common Firebase Admin errors are better as 400s for test clarity
      if (
        code === "auth/email-already-exists" ||
        code === "auth/invalid-email" ||
        code === "auth/invalid-password"
      ) {
        return res.status(400).json({
          error: "failed to mint token",
          code,
          message,
        });
      }

      return res.status(500).json({
        error: "failed to mint token",
        code,
        message,
      });
    }
  });

  if (!ctx.__logged_test_custom_token_post) {
    ctx.__logged_test_custom_token_post = true;
    log.info?.({ route: `/api${ROUTE}`, method: "POST" }, "[routes] mounted");
  }
};
