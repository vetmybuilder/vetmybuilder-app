// server/routes/payments/spotlight/purchase.post.js
/**
 * POST /api/payments/spotlight/purchase
 *
 * Creates a Spotlight one-off purchase (pending_admin).
 * Inserts a row into payments_oneoff with amount + currency.
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx");
  }

  router.post("/payments/spotlight/purchase", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "/payments/spotlight/purchase",
    });

    try {
      const userId = req.user?.uid;
      if (!userId) {
        log.warn("Unauthenticated spotlight purchase attempt");
        return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      }

      const { currency, origin } = req.body || {};

      if (!currency) {
        log.warn("Missing currency field");
        return res.status(400).json({
          ok: false,
          error: "CURRENCY_REQUIRED",
        });
      }

      if (!origin) {
        log.warn("Missing origin field");
        return res.status(400).json({
          ok: false,
          error: "ORIGIN_REQUIRED",
        });
      }

      // Spotlight price is fixed
      const AMOUNT = 3999;

      // Create mock session ID
      const sessionId = `cs_test_${Math.random().toString(36).slice(2)}`;

      log.info(
        { userId, currency, sessionId, amount: AMOUNT },
        "Spotlight purchase initiated"
      );

      // -------------------------------------------------------------------
      // INSERT PAYMENT ROW
      // -------------------------------------------------------------------
      await mysqlQuery(
        `
        INSERT INTO payments_oneoff
          (user_id, type, amount, currency, status,
           provider_session_id, created_at, updated_at)
        VALUES
          (?, 'spotlight', ?, ?, 'pending_admin',
           ?, NOW(), NOW())
        `,
        [userId, AMOUNT, currency, sessionId]
      );

      log.info(
        { userId, sessionId, amount: AMOUNT },
        "Inserted payments_oneoff spotlight purchase (pending_admin)"
      );

      // Build hosted checkout URL
      const hostedURL = `${origin}/payments/mock/checkout/${sessionId}`;

      const response = {
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
      };

      log.info(
        { sessionId, userId },
        "Spotlight purchase session created; returning session details"
      );

      res.json(response);
      ctx.logActivity("spotlight.purchase", "info", req.user.uid, "Spotlight purchased");
      return;
    } catch (err) {
      const logErr = err?.message || String(err);
      log.error(
        { error: logErr, stack: err?.stack },
        "Spotlight purchase failed"
      );

      return res.status(500).json({
        ok: false,
        error: "SPOTLIGHT_PURCHASE_FAILED",
        message: err?.message,
      });
    }
  });
};
