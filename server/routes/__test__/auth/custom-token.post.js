// server/v2/routes/__test__/auth/custom-token.post.js

/**
 * POST /api/__test__/auth/custom-token
 * Headers: X-Test-Secret
 * Body: {
 *   uid: string,
 *   email?: string,           // optional: set/ensure email on the Auth user
 *   password?: string,        // optional: set password (enables email+password login)
 *   displayName?: string      // optional: set display name
 * }
 *
 * Behavior:
 * - Ensures a Firebase Auth user exists for `uid`.
 * - If email/password/displayName are provided, creates or updates the Auth user with those fields.
 * - Returns a fresh custom token.
 */
module.exports = (router, ctx) => {
  const { assertTestAccess, admin } = ctx;

  router.post("/__test__/auth/custom-token", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const body = req.body || {};
    const uid = String(body.uid || "").trim();
    const email = body.email ? String(body.email).trim() : undefined;
    const password = body.password ? String(body.password) : undefined;
    const displayName = body.displayName ? String(body.displayName).trim() : undefined;

    if (!uid) return res.status(400).json({ error: "uid is required" });

    if (!admin?.apps?.length) {
      return res.status(503).json({ error: "firebase admin not initialised" });
    }

    const auth = admin.auth();

    try {
      // 1) Look up the user; if missing, create; else update with provided fields.
      let userRecord = null;
      try {
        userRecord = await auth.getUser(uid);
      } catch (e) {
        const isNotFound =
          e?.code === "auth/user-not-found" ||
          String(e?.message || "").toLowerCase().includes("no user record");
        if (!isNotFound) throw e;
      }

      if (!userRecord) {
        const createArgs = { uid };
        if (email) createArgs.email = email;
        if (password) createArgs.password = password;
        if (displayName) createArgs.displayName = displayName;
        userRecord = await auth.createUser(createArgs);
      } else {
        const update = {};
        if (email && userRecord.email !== email) update.email = email;
        if (password) update.password = password;
        if (displayName && userRecord.displayName !== displayName) update.displayName = displayName;

        if (Object.keys(update).length > 0) {
          userRecord = await auth.updateUser(uid, update);
        }
      }

      // 2) Mint a fresh custom token
      const customToken = await auth.createCustomToken(uid);

      // 3) Respond (keep both fields for test compatibility)
      res.json({
        ok: true,
        uid,
        email: userRecord?.email ?? null,
        displayName: userRecord?.displayName ?? null,
        customToken,
        token: customToken,
      });
    } catch (e) {
      console.error("[test] custom-token error:", e);
      const code = e?.code || "unknown";
      return res
        .status(500)
        .json({ error: "failed to mint token", code, message: String(e?.message || e) });
    }
  });
};
