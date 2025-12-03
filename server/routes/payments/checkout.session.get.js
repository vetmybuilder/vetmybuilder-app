// server/routes/payments/checkout.session.get.js
module.exports = (router, ctx) => {
  const { auth } = ctx;
  const log = ctx.log || console;

  function resolveSessionId(req) {
    // If we have a param ID and it's not literally "session", use it.
    const paramId = req.params && req.params.id;
    if (paramId && paramId !== "session") {
      return String(paramId);
    }

    // Otherwise fall back to query params
    const qId =
      req.query?.sessionId || req.query?.session_id || req.query?.id || "";
    return String(qId || "");
  }

  function handleGet(req, res) {
    try {
      const payments = ctx.payments;
      if (!payments || typeof payments.getSession !== "function") {
        return res.status(500).json({ error: "payments not initialised" });
      }

      const id = resolveSessionId(req);
      if (!id) {
        return res.status(400).json({ error: "sessionId required" });
      }

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

  // IMPORTANT: define the more specific 'session' route first
  router.get("/payments/checkout/session", auth, handleGet);
  router.get("/payments/checkout/:id", auth, handleGet);
};

// // server/routes/payments/checkout.session.get.js
// module.exports = (router, ctx) => {
//   const auth = ctx.auth;
//   const log = ctx.log || console;

//   function handleGet(req, res) {
//     try {
//       const payments = ctx.payments;
//       if (!payments || typeof payments.getSession !== "function") {
//         return res.status(500).json({ error: "payments not initialised" });
//       }

//       const id = String(req.params.id || "");
//       const session = payments.getSession(id);
//       if (!session) {
//         log.warn?.("[payments.session] not found id=%s", id);
//         return res.status(404).json({ error: "Not found" });
//       }

//       // Optional: ensure the current user owns the session
//       if (req.user?.uid && session.userId && session.userId !== req.user.uid) {
//         return res.status(403).json({ error: "Forbidden" });
//       }

//       return res.status(200).json({ ok: true, session });
//     } catch (e) {
//       log.error?.("[payments.session] error: %s", e?.stack || e?.message || e);
//       return res
//         .status(500)
//         .json({ error: e?.message || "Failed to load session" });
//     }
//   }

//   // Existing path some code still uses
//   router.get("/payments/checkout/:id", auth, handleGet);
// };
