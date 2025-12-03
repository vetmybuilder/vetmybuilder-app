/**
 * POST /api/payments/oneoff/spotlight/purchase
 * Creates/updates a payments_oneoff row with status "pending_admin".
 * Tradesman is placed into spotlight-pending state until admin approval.
 */

module.exports = (router, ctx) => {
  const { auth, requireTradesman, mysqlQuery } = ctx;

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post(
    "/payments/oneoff/spotlight/purchase",
    auth,
    requireTradesman,
    async (req, res) => {
      try {
        const authedUid =
          req.user?.uid || req.user?.user_id || req.user?.id || null;

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
            error: "MISSING_USER",
            message: "userId missing",
          });
        }

        const totalAmount = Number(amount);
        const totalCurrency = String(currency || "GBP").toUpperCase();
        const sessionId = String(provider_session_id || "");
        const paymentIntent = provider_payment_intent || null;

        // -------------------------------------------------------
        // 1) Mark tradesman as pending Spotlight (draft state)
        // -------------------------------------------------------
        await mysqlQuery(
          `
          UPDATE tradesmen
          SET purchased_plan  = 'spotlight',
              subscription_status = 'draft',
              plan_updated_at = NOW()
          WHERE user_id = ?
          `,
          [userId]
        );

        let paymentId = null;

        // -------------------------------------------------------
        // 2) UPSERT payments_oneoff
        // -------------------------------------------------------
        if (sessionId) {
          const existing = await mysqlQuery(
            `SELECT id FROM payments_oneoff WHERE provider_session_id = ? LIMIT 1`,
            [sessionId]
          );

          if (existing.length > 0) {
            const id = existing[0].id;

            await mysqlQuery(
              `
              UPDATE payments_oneoff
              SET user_id = ?,
                  type = 'spotlight',
                  amount = ?,
                  currency = ?,
                  status = 'pending_admin',
                  provider_payment_intent = ?
              WHERE id = ?
              `,
              [
                userId,
                Number.isFinite(totalAmount) ? totalAmount : null,
                totalCurrency,
                paymentIntent,
                id,
              ]
            );

            paymentId = id;
          }
        }

        if (paymentId == null) {
          const result = await mysqlQuery(
            `
            INSERT INTO payments_oneoff
              (user_id, type, entity_id, amount, currency, status,
               provider_session_id, provider_payment_intent,
               created_at)
            VALUES
              (?, 'spotlight', NULL, ?, ?, 'pending_admin',
               ?, ?, NOW())
            `,
            [
              userId,
              Number.isFinite(totalAmount) ? totalAmount : null,
              totalCurrency,
              sessionId || null,
              paymentIntent,
            ]
          );
          paymentId = result.insertId;
        }

        return res.json({
          ok: true,
          paymentId,
          subscription: { planId: "spotlight", status: "pending_admin" },
        });
      } catch (e) {
        console.error("[spotlight.purchase] error", e);
        return res.status(500).json({
          ok: false,
          error: "ONEOFF_SPOTLIGHT_FAILED",
          message: e?.message || String(e),
        });
      }
    }
  );
};
