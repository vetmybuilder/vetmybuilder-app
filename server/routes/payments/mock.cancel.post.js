// Supports BOTH:
//   POST /api/payments/mock/:id/cancel
//   POST /api/payments/mock/cancel   { sessionId }
module.exports = (router, ctx) => {
  const { auth, payments } = ctx;
  if (!payments) throw new Error("payments not attached to ctx");

  async function handle(req, res) {
    try {
      if (!req.user?.uid)
        return res.status(401).json({ error: "Unauthorized" });

      const id = req.params?.id || req.body?.sessionId;
      if (!id) return res.status(400).json({ error: "sessionId required" });

      const s = payments.getSession(id);
      if (!s) return res.status(404).json({ error: "Not found" });
      if (s.userId !== req.user.uid) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const updated = payments.cancel(id);
      return res.status(200).json({ ok: true, session: updated });
    } catch (e) {
      return res
        .status(500)
        .json({ error: e.message || "Failed to cancel session" });
    }
  }

  // New body-style endpoint
  router.post("/payments/mock/cancel", auth, handle);
  // Legacy id-in-path endpoint
  router.post("/payments/mock/:id/cancel", auth, handle);
};
