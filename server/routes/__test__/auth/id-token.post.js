// server/routes/__test__/auth/id-token.post.js

/**
 * POST /api/__test__/auth/id-token
 */
module.exports = (router, ctx) => {
  const {
    assertTestAccess,
    admin,
    resolveFirebaseApiKey,
    fetch = global.fetch,
  } = ctx;

  const log = ctx.log || console;
  const TAG = "[test/auth/id-token.post]";
  const ROUTE = "/__test__/auth/id-token";

  router.post(ROUTE, async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const uid = String(req.body?.uid || "").trim();
    log.info({ uid }, `${TAG} hit`);

    try {
      if (!uid) {
        log.warn(`${TAG} missing uid`);
        return res.status(400).json({ error: "uid required" });
      }

      if (!admin?.apps?.length) {
        log.error(`${TAG} firebase admin not initialised`);
        return res
          .status(503)
          .json({ error: "firebase admin not initialised" });
      }

      const apiKey = resolveFirebaseApiKey?.() || process.env.FIREBASE_API_KEY;
      if (!apiKey) {
        log.error(`${TAG} missing Firebase Web API key`);
        return res.status(500).json({ error: "Missing Web API key" });
      }

      const customToken = await admin.auth().createCustomToken(uid);
      log.info(`${TAG} custom token created`);

      const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: customToken,
            returnSecureToken: true,
          }),
        }
      );

      const data = await resp.json();
      if (!resp.ok) {
        log.error(`${TAG} exchange failed`, { details: data });
        return res
          .status(500)
          .json({ error: "exchange failed", details: data });
      }

      log.info(`${TAG} success`);
      return res.json({ ok: true, idToken: data.idToken });
    } catch (e) {
      log.error(`${TAG} unhandled error`, { error: e?.message || e });
      return res.status(500).json({ error: "failed to mint id token" });
    }
  });

  // Correct structured mount log
  if (!ctx.__logged_test_id_token_post) {
    ctx.__logged_test_id_token_post = true;

    log.info(
      {
        route: `/api${ROUTE}`,
        method: "POST",
      },
      "[routes] mounted"
    );
  }
};
