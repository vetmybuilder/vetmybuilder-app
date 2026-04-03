// server/lib/middleware.js
const { withRequest } = require("./logger");

function isAuthDependencyDown(err) {
  const msg = String(err?.message || "");
  const code = String(err?.errorInfo?.code || err?.code || "");

  return (
    // firebase-admin wraps network failures like this
    code === "app/network-error" ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("127.0.0.1:9099") ||
    msg.includes("fetch failed") ||
    msg.includes("connect ECONNREFUSED")
  );
}

function authMiddleware(admin) {
  return async function authMw(req, res, next) {
    const log = withRequest(req);

    // Sim-bot shortcut: X-Sim-Uid + X-Test-Secret bypasses Firebase token exchange.
    // Only active when ENABLE_TEST_ROUTES=1 (same guard as the test routes).
    if (process.env.ENABLE_TEST_ROUTES === "1") {
      const secret = process.env.E2E_TEST_SECRET;
      const simUid = req.headers["x-sim-uid"];
      if (secret && simUid && req.headers["x-test-secret"] === secret) {
        req.user = { uid: simUid };
        return next();
      }
    }

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    if (!admin || !admin.auth) {
      log.error("Auth not initialized on server");
      return res.status(500).json({ error: "Auth not initialized on server" });
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.user = decoded;
      return next();
    } catch (e) {
      // If the emulator (or auth dependency) is down/unreachable, return 503
      // so tests/UI fail with a meaningful signal instead of “Invalid token”.
      if (isAuthDependencyDown(e)) {
        log.error(
          {
            code: e?.errorInfo?.code || e?.code || null,
            message: String(e?.message || ""),
          },
          "[auth] verify failed: auth dependency unavailable",
        );

        return res.status(503).json({
          error: "auth_unavailable",
          message:
            "Auth verification service unavailable (Firebase emulator not reachable).",
        });
      }

      log.warn(
        {
          code: e?.errorInfo?.code || e?.code || null,
          message: String(e?.message || ""),
        },
        "[auth] verify failed: invalid token",
      );

      return res.status(401).json({ error: "Invalid token" });
    }
  };
}

module.exports = { authMiddleware };
