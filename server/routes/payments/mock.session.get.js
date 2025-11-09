// GET /api/payments/mock/session?sessionId=...
// Legacy alias used by the success page; proxies to the in-memory store.
module.exports = (router, ctx) => {
  const { auth, payments } = ctx;
  if (!payments) throw new Error("payments not attached to ctx");

  router.get("/payments/mock/session", auth, (req, res) => {
    try {
      if (!req.user?.uid)
        return res.status(401).json({ error: "Unauthorized" });

      const id = req.query.sessionId || req.query.id;
      if (!id) return res.status(400).json({ error: "sessionId required" });

      const s = payments.getSession(String(id));
      if (!s) return res.status(404).json({ error: "Not found" });
      if (s.userId !== req.user.uid)
        return res.status(403).json({ error: "Forbidden" });

      return res.json({ ok: true, session: s });
    } catch (e) {
      return res
        .status(500)
        .json({ error: e?.message || "Failed to load session" });
    }
  });
};
