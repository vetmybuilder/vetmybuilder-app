// server/routes/payments/checkout.session.get.js
module.exports = (router, ctx) => {
  const auth = ctx.auth;
  const log = ctx.log || console;

  function handleGet(req, res) {
    try {
      const payments = ctx.payments;
      if (!payments || typeof payments.getSession !== "function") {
        return res.status(500).json({ error: "payments not initialised" });
      }

      const id = String(req.params.id || "");
      const session = payments.getSession(id);
      if (!session) {
        log.warn?.("[payments.session] not found id=%s", id);
        return res.status(404).json({ error: "Not found" });
      }

      // Optional: ensure the current user owns the session
      if (req.user?.uid && session.userId && session.userId !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }

      return res.status(200).json({ ok: true, session });
    } catch (e) {
      log.error?.("[payments.session] error: %s", e?.stack || e?.message || e);
      return res
        .status(500)
        .json({ error: e?.message || "Failed to load session" });
    }
  }

  // Existing path some code still uses
  router.get("/payments/checkout/:id", auth, handleGet);
};
