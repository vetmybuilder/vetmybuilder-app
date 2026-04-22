// server/routes/payments/mock.session.get.js
// GET /api/payments/mock/session?sessionId=...
// Legacy alias used by the success page; proxies to the in-memory store.

module.exports = (router, ctx) => {
  const { auth, payments } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  if (!payments) throw new Error("payments not attached to ctx");

  router.get("/payments/mock/session", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "GET /api/payments/mock/session",
    });

    try {
      if (!req.user?.uid) {
        log.warn("Unauthorized request");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const id = req.query.sessionId || req.query.id || null;

      if (!id) {
        log.warn("Missing sessionId");
        return res.status(400).json({ error: "sessionId required" });
      }

      const sid = String(id);
      const session = await payments.getSession(sid);

      if (!session) {
        log.warn({ sid }, "Session not found");
        return res.status(404).json({ error: "Not found" });
      }

      if (session.userId !== req.user.uid) {
        log.warn(
          { sid, owner: session.userId, requester: req.user.uid },
          "User attempted to access another user's payment session"
        );
        return res.status(403).json({ error: "Forbidden" });
      }

      log.info({ sid }, "Session loaded successfully");
      return res.json({ ok: true, session });
    } catch (e) {
      log.error(
        { err: e?.message, stack: e?.stack },
        "Unexpected error loading mock payment session"
      );

      return res.status(500).json({
        error: e?.message || "Failed to load session",
      });
    }
  });
};
