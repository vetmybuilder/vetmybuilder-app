/**
 * POST /api/payments/spotlight/purchase
 *
 * Creates a Spotlight one-off purchase (pending_admin).
 * Inserts a row into payments_oneoff with amount + currency.
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const TAG = "[spotlight.purchase]";

  router.post("/payments/spotlight/purchase", auth, async (req, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      }

      const { currency, origin } = req.body;

      if (!currency) {
        return res.status(400).json({
          ok: false,
          error: "CURRENCY_REQUIRED",
        });
      }

      // Amount is fixed for Spotlight
      const AMOUNT = 3999;

      // --- Create sessionId (mock style) ---
      const sessionId = `cs_test_${Math.random().toString(36).slice(2)}`;

      // --- Insert into payments_oneoff ---
      await mysqlQuery(
        `
        INSERT INTO payments_oneoff
          (user_id, type, amount, currency, status, provider_session_id, created_at, updated_at)
        VALUES
          (?, 'spotlight', ?, ?, 'pending_admin', ?, NOW(), NOW())
        `,
        [userId, AMOUNT, currency, sessionId]
      );

      // --- Build checkout response ---
      const hostedURL = `${origin}/payments/mock/checkout/${sessionId}`;

      return res.json({
        ok: true,
        sessionId,
        session: {
          id: sessionId,
          status: "open",
          userId,
          items: [
            {
              price: { amount: AMOUNT, currency },
              quantity: 1,
            },
          ],
          total: { amount: AMOUNT, currency },
          mode: "payment",
          hosted_url: hostedURL,
          success_url: `${origin}/payments/mock/success`,
          cancel_url: `${origin}/payments/mock/cancel`,
          metadata: {
            planId: "spotlight",
            vmb_type: "one_off",
          },
        },
        hosted_url: hostedURL,
      });
    } catch (err) {
      console.error(`${TAG} error`, err);
      return res.status(500).json({
        ok: false,
        error: "SPOTLIGHT_PURCHASE_FAILED",
        message: err?.message,
      });
    }
  });
};
