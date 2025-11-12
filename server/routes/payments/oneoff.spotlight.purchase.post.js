/**
 * POST /api/payments/oneoff/spotlight/purchase
 * Sets tradesmen to draft/spotlight and UPSERTS a pending payments_oneoff row.
 */
module.exports = (router, ctx) => {
  const { db, auth, requireTradesman } = ctx;

  const hasTable = (name) =>
    !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`).get(name);

  router.post("/payments/oneoff/spotlight/purchase", auth, requireTradesman, (req, res) => {
    try {
      if (!hasTable("tradesmen") || !hasTable("payments_oneoff")) {
        return res.status(500).json({
          ok: false,
          error: "TABLES_MISSING",
          message: "Required tables 'tradesmen' and/or 'payments_oneoff' are missing",
        });
      }

      const authedUid =
        (req.user && (req.user.uid || req.user.user_id || req.user.id)) || null;

      const {
        userId: bodyUserId,
        amount,
        currency,
        provider_session_id,
        provider_payment_intent,
      } = req.body || {};

      const userId = String(bodyUserId || authedUid || "");
      if (!userId) {
        return res.status(400).json({
          ok: false,
          error: "ONEOFF_PURCHASE_MISSING_USER",
          message: "userId is required (or must be available from auth)",
        });
      }

      const totalAmount = Number(amount);
      const totalCurrency = String(currency || "GBP").toUpperCase();
      const sessionId = String(provider_session_id || "");
      const paymentIntent = provider_payment_intent || null;

      const upsert = db.transaction(() => {
        // tradesmen -> draft + spotlight
        db.prepare(
          `
UPDATE tradesmen
SET subscription_status='draft',
    purchased_plan='spotlight',
    plan_updated_at=CURRENT_TIMESTAMP
WHERE user_id = ?
`
        ).run(userId);

        if (sessionId) {
          const existing = db
            .prepare(
              `SELECT id FROM payments_oneoff WHERE provider_session_id = ? LIMIT 1`
            )
            .get(sessionId);

          if (existing && existing.id != null) {
            db.prepare(
              `
UPDATE payments_oneoff
SET user_id = ?,
    type = 'spotlight',
    amount = ?,
    currency = ?,
    status = 'pending',
    provider_payment_intent = ?,
    expires_at = NULL
WHERE id = ?
`
            ).run(
              userId,
              Number.isFinite(totalAmount) ? totalAmount : null,
              totalCurrency || null,
              paymentIntent || null,
              existing.id
            );
            return existing.id;
          }
        }

        const info = db
          .prepare(
            `
INSERT INTO payments_oneoff
  (user_id, type, entity_id, amount, currency, status,
   provider_session_id, provider_payment_intent, expires_at, created_at)
VALUES
  (?,       'spotlight', NULL,     ?,      ?,        'pending',
   ?,                    ?,                          NULL,       CURRENT_TIMESTAMP)
`
          )
          .run(
            userId,
            Number.isFinite(totalAmount) ? totalAmount : null,
            totalCurrency || null,
            sessionId || null,
            paymentIntent || null
          );
        return info.lastInsertRowid;
      });

      const paymentId = upsert();

      return res.json({
        ok: true,
        paymentId,
        subscription: { planId: "spotlight", status: "draft" },
      });
    } catch (err) {
      console.error("[oneoff.spotlight.purchase] error:", err);
      return res.status(500).json({
        ok: false,
        error: "ONEOFF_PURCHASE_FAILED",
        message: err?.message || String(err),
      });
    }
  });
};