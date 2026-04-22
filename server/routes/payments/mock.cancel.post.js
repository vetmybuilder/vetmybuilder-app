// server/routes/payments/mock.cancel.post.js

// Supports BOTH:
//   POST /api/payments/mock/:id/cancel
//   POST /api/payments/mock/cancel   { sessionId }

module.exports = (router, ctx) => {
  const { auth, payments } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  if (!payments) throw new Error("payments not attached to ctx");

  async function handle(req, res) {
    const log = withRequest(req, logger).child({
      route: "POST /api/payments/mock/cancel",
    });

    try {
      if (!req.user?.uid) {
        log.warn("Unauthorized request");
        return res.status(401).json({ error: "unauthorized" });
      }

      const sessionId = req.params?.id || req.body?.sessionId;

      if (!sessionId) {
        log.warn("Missing sessionId");
        return res.status(400).json({ error: "sessionId_required" });
      }

      const session = await payments.getSession(sessionId);

      if (!session) {
        log.warn({ sessionId }, "Session not found");
        return res.status(404).json({ error: "not_found" });
      }

      if (session.userId !== req.user.uid) {
        log.warn(
          { sessionId, owner: session.userId, requester: req.user.uid },
          "Forbidden — user does not own session"
        );
        return res.status(403).json({ error: "forbidden" });
      }

      const updated = await payments.cancel(sessionId);

      log.info({ sessionId }, "Mock session cancelled");
      res.status(200).json({ ok: true, session: updated });
      ctx.logActivity("payment.cancel", "info", req.user?.uid || "system", "Payment cancelled");
      return;
    } catch (e) {
      log.error(
        { errMsg: e?.message, stack: e?.stack },
        "Unexpected error cancelling mock payment session"
      );
      return res.status(500).json({
        error: "server_error",
        detail: e?.message || "Failed to cancel session",
      });
    }
  }

  // New body-style endpoint
  router.post("/payments/mock/cancel", auth, handle);

  // Legacy id-in-path endpoint
  router.post("/payments/mock/:id/cancel", auth, handle);
};
