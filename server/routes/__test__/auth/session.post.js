// server/v2/routes/__test__/auth/session.post.js
module.exports = (router, ctx) => {
  const { auth } = ctx;

  router.post("/__test__/auth/session", async (req, res) => {
    try {
      const hdr = req.get("authorization") || req.get("Authorization") || "";
      const PREFIX = "Bearer ";
      if (!hdr.startsWith(PREFIX)) {
        return res
          .status(400)
          .json({ error: "Missing Authorization: Bearer <token>" });
      }
      const idToken = hdr.slice(PREFIX.length).trim();
      if (!idToken) return res.status(400).json({ error: "Empty token" });

      // Verify token (recommended)
      let decoded = null;
      if (auth && typeof auth.verifyIdToken === "function") {
        try {
          decoded = await auth.verifyIdToken(idToken); // { uid, email, ... }
        } catch {
          return res.status(401).json({ error: "Invalid ID token" });
        }
      }

      if (!req.session) {
        return res
          .status(500)
          .json({
            error: "Session middleware not configured (req.session missing)",
          });
      }

      // Create a fresh server session that your SSR will recognize
      req.session.regenerate((regenErr) => {
        if (regenErr)
          return res.status(500).json({ error: "Failed to start session" });

        // ✅ Store fields commonly checked by SSR/middleware:
        // adjust names if your app expects different keys
        const uid = decoded?.uid || null;
        const email = decoded?.email || null;

        req.session.uid = uid; // many apps check this
        req.session.email = email || undefined;

        req.session.user = {
          uid,
          email,
          // add other fields your app might read:
          // firstName, lastName, roles, scopes, etc. if applicable
        };

        req.session.isAuthenticated = true; // generic flag some apps use
        req.session.authTime = decoded?.auth_time || Date.now();
        // optional: keep raw token for debugging
        req.session.idToken = idToken;

        req.session.save((saveErr) => {
          if (saveErr)
            return res.status(500).json({ error: "Failed to persist session" });
          // The session middleware will now emit Set-Cookie: sid=...
          return res.status(204).end();
        });
      });
    } catch {
      return res.status(500).json({ error: "Failed to establish session" });
    }
  });
};
