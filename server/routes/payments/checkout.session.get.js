// server/routes/payments/checkout.session.get.js

module.exports = (router, ctx) => {
  const { auth } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  /** Resolve a session ID from params or query */
  function resolveSessionId(req) {
    const p = req.params?.id;
    if (p && p !== "session") return String(p);

    return String(
      req.query?.sessionId || req.query?.session_id || req.query?.id || ""
    );
  }

  /** Main handler */
  function handleGet(req, res) {
    const log = withRequest(req, logger).child({
      route: "GET /api/payments/checkout/session",
    });

    try {
      const payments = ctx.payments;

      if (!payments || typeof payments.getSession !== "function") {
        log.error("Payments module is not initialised");
        return res.status(500).json({ error: "payments_not_initialised" });
      }

      const id = resolveSessionId(req);

      if (!id) {
        log.warn("Missing sessionId");
        return res.status(400).json({ error: "sessionId_required" });
      }

      const session = payments.getSession(id);
      if (!session) {
        log.warn({ sessionId: id }, "Session not found");
        return res.status(404).json({ error: "not_found" });
      }

      // Optional: ownership validation
      if (req.user?.uid && session.userId && session.userId !== req.user.uid) {
        log.warn(
          { sessionId: id, owner: session.userId, requester: req.user.uid },
          "Forbidden — session does not belong to user"
        );
        return res.status(403).json({ error: "forbidden" });
      }

      log.info({ sessionId: id }, "Session retrieved");
      return res.status(200).json({ ok: true, session });
    } catch (e) {
      logger.error(
        { errMsg: e?.message, stack: e?.stack },
        "Unexpected error retrieving checkout session"
      );
      return res
        .status(500)
        .json({ error: "server_error", detail: e?.message });
    }
  }

  // Register more specific route first
  router.get("/payments/checkout/session", auth, handleGet);
  router.get("/payments/checkout/:id", auth, handleGet);
};
