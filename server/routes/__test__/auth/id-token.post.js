// server/routes/__test__/auth/id-token.post.js

/**
 * POST /api/__test__/auth/id-token
 * Headers: X-Test-Secret
 * Body: { uid }
 *
 * Mints a Firebase custom token, then exchanges it for an ID token via REST using the Web API key.
 */
module.exports = (router, ctx) => {
  const {
    assertTestAccess,
    admin,
    resolveFirebaseApiKey,
    fetch = global.fetch,
  } = ctx;

const prefix = ctx.API_PREFIX || "";
console.log("ROUTE MOUNT>>>>>>>>>>:", prefix + "/__test__/auth/id-token");

  router.post("/__test__/auth/id-token", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    try {
      const uid = String(req.body?.uid || "").trim();
      if (!uid) return res.status(400).json({ error: "uid required" });

      if (!admin?.apps?.length) {
        return res
          .status(503)
          .json({ error: "firebase admin not initialised" });
      }

      const apiKey = resolveFirebaseApiKey?.() || process.env.FIREBASE_API_KEY;
      if (!apiKey)
        return res.status(500).json({ error: "Missing Web API key" });

      // 1) Custom token
      const customToken = await admin.auth().createCustomToken(uid);

      // 2) Exchange for ID token via REST
      const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        }
      );

      const data = await resp.json();
      if (!resp.ok) {
        return res
          .status(500)
          .json({ error: "exchange failed", details: data });
      }

      res.json({ ok: true, idToken: data.idToken });
    } catch (e) {
      console.error("[test] id-token error", e);
      res.status(500).json({ error: "failed to mint id token" });
    }
  });
};
