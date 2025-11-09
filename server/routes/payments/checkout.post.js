// POST /api/payments/checkout
// One-off:
//   Body: { type: "unlock_contact", projectId, amountPence?, currency?, success_url?, cancel_url?, origin? }
//   -> creates mock session + inserts PENDING row in payments_oneoff
//
// Subscription:
//   Body: { type: "subscription", planId, amountPence, currency?, success_url?, cancel_url?, origin? }
//   -> creates mock session + inserts PENDING row in payments_subscription
//
// NOTE: We keep exactly the same endpoint for both paths.

module.exports = (router, ctx) => {
  const { auth, payments, db } = ctx;
  if (!payments) throw new Error("payments not attached to ctx");
  if (!db) throw new Error("db not attached to ctx");

  function ensurePaymentsOneoffTable() {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS payments_oneoff (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id TEXT NOT NULL,
         type TEXT NOT NULL,               -- 'unlock_contact', etc.
         entity_id INTEGER,                -- e.g. project id
         amount INTEGER NOT NULL,          -- pence
         currency TEXT NOT NULL DEFAULT 'GBP',
         status TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'succeeded'|'failed'|'refunded'
         provider_session_id TEXT,
         provider_payment_intent TEXT,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`
    ).run();
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_oneoff_user_type_entity
         ON payments_oneoff (user_id, type, entity_id, status)`
    ).run();
  }

  function ensurePaymentsSubscriptionTable() {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS payments_subscription (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         buyer_uid TEXT NOT NULL,                 -- tradesman uid
         plan_id   TEXT NOT NULL,                 -- 'gold' | 'platinum' | etc
         amount    INTEGER NOT NULL,              -- pence
         currency  TEXT NOT NULL DEFAULT 'GBP',
         status    TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'succeeded'|'canceled'
         provider_session_id      TEXT UNIQUE,
         provider_customer_id     TEXT,
         provider_subscription_id TEXT,
         provider_payment_intent  TEXT,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`
    ).run();
  }

  // small helper: normalize success/cancel URLs (allow origin shortcut)
  function buildUrls(body) {
    const origin = body?.origin ? String(body.origin) : null;

    const success_url = body?.success_url
      ? String(body.success_url)
      : origin
      ? `${origin}/payments/mock/success?session_id={SESSION_ID}`
      : undefined;

    const cancel_url = body?.cancel_url
      ? String(body.cancel_url)
      : origin
      ? `${origin}/payments/mock/cancel`
      : undefined;

    return { success_url, cancel_url };
  }

  router.post("/payments/checkout", auth, (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const type = String(req.body?.type || "unlock_contact").toLowerCase();
      const { success_url, cancel_url } = buildUrls(req.body);

      // ---------- ONE-OFF: unlock_contact ----------
      if (type === "unlock_contact") {
        const projectId = Number(req.body?.projectId);
        if (!Number.isFinite(projectId) || projectId <= 0) {
          return res.status(400).json({ error: "Invalid projectId" });
        }

        const amountPence =
          Number(req.body?.amountPence) > 0
            ? Number(req.body.amountPence)
            : 299;
        const currency = (req.body?.currency || "GBP").toUpperCase();

        const session = payments.createCheckout({
          userId: uid,
          items: [
            {
              label: "Unlock homeowner contact",
              price: { amount: amountPence, currency },
              quantity: 1,
            },
          ],
          success_url,
          cancel_url,
          metadata: {
            type: "unlock_contact",
            projectId,
          },
        });

        ensurePaymentsOneoffTable();
        db.prepare(
          `INSERT INTO payments_oneoff
             (user_id, type, entity_id, amount, currency, status, provider_session_id)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)`
        ).run(
          uid,
          "unlock_contact",
          projectId,
          amountPence,
          currency,
          session.id
        );

        return res.json({
          ok: true,
          sessionId: session.id,
          url: `/payments/mock/checkout/${encodeURIComponent(session.id)}`,
          session,
        });
      }

      // ---------- SUBSCRIPTION ----------
      if (type === "subscription") {
        const planId = String(req.body?.planId || "").toLowerCase();
        if (!planId) {
          return res
            .status(400)
            .json({ error: "planId is required for subscription" });
        }
        const amountPence = Number(req.body?.amountPence || 0);
        if (!Number.isFinite(amountPence) || amountPence <= 0) {
          return res
            .status(400)
            .json({ error: "amountPence must be > 0 for subscription" });
        }
        const currency = (req.body?.currency || "GBP").toUpperCase();

        const session = payments.createCheckout({
          userId: uid,
          items: [
            {
              label: `Subscribe: ${planId.toUpperCase()}`,
              price: { amount: amountPence, currency },
              quantity: 1,
            },
          ],
          success_url,
          cancel_url,
          metadata: {
            type: "subscription",
            planId, // important for pay handler
          },
        });

        ensurePaymentsSubscriptionTable();
        db.prepare(
          `INSERT OR IGNORE INTO payments_subscription
             (buyer_uid, plan_id, amount, currency, status, provider_session_id)
           VALUES (?, ?, ?, ?, 'pending', ?)`
        ).run(uid, planId, amountPence, currency, session.id);

        return res.json({
          ok: true,
          sessionId: session.id,
          url: `/payments/mock/checkout/${encodeURIComponent(session.id)}`,
          session,
        });
      }

      // Fallback guard
      return res.status(400).json({ error: `Unsupported type: ${type}` });
    } catch (e) {
      console.error("[payments.checkout] error:", e);
      return res
        .status(500)
        .json({ error: e?.message || "Failed to create checkout" });
    }
  });
};
