// server/routes/payments/oneoff/spotlight/purchase.post.js
/**
 * POST /api/payments/oneoff/spotlight/purchase
 * Creates/updates a payments_oneoff row with status "pending_admin".
 * Tradesman is placed into spotlight-pending state until admin approval.
 */

module.exports = (router, ctx) => {
  const { auth, requireTradesman, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post(
    "/payments/oneoff/spotlight/purchase",
    auth,
    requireTradesman,
    async (req, res) => {
      const log = withRequest(req, logger).child({
        route: "/payments/oneoff/spotlight/purchase",
      });

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

        const userId = String(bodyUserId || authedUid || "").trim();
        if (!userId) {
          log.warn("Missing userId");
          return res.status(400).json({
            ok: false,
            error: "MISSING_USER",
            message: "userId missing",
          });
        }

        const totalAmount = Number(amount);
        const totalCurrency = String(currency || "GBP").toUpperCase();
        const sessionId = String(provider_session_id || "").trim();
        const paymentIntent = provider_payment_intent || null;

        log.info(
          { userId, sessionId, amount: totalAmount, currency: totalCurrency },
          "Spotlight purchase initiated"
        );

        // -------------------------------------------------------
        // 1) Mark tradesman as pending Spotlight
        // -------------------------------------------------------
        await mysqlQuery(
          `
          UPDATE tradesmen
          SET purchased_plan      = 'spotlight',
              subscription_status = 'draft',
              plan_updated_at     = NOW()
          WHERE user_id = ?
          `,
          [userId]
        );

        log.info({ userId }, "Tradesman marked spotlight-pending");

        // -------------------------------------------------------
        // 2) UPSERT payments_oneoff
        // -------------------------------------------------------
        let paymentId = null;

        if (sessionId) {
          const existing = await mysqlQuery(
            `SELECT id FROM payments_oneoff WHERE provider_session_id = ? LIMIT 1`,
            [sessionId]
          );

          if (existing.length > 0) {
            paymentId = existing[0].id;

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
                paymentId,
              ]
            );

            log.info(
              { paymentId, sessionId },
              "Updated existing payments_oneoff row (pending_admin)"
            );
          }
        }

        // Insert if not updated above
        if (paymentId == null) {
          const result = await mysqlQuery(
            `
            INSERT INTO payments_oneoff
              (user_id, type, entity_id, amount, currency, status,
               provider_session_id, provider_payment_intent, created_at)
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

          log.info(
            { paymentId, sessionId },
            "Created new payments_oneoff row (pending_admin)"
          );
        }

        log.info(
          { paymentId, userId },
          "Spotlight purchase recorded successfully"
        );

        res.json({
          ok: true,
          paymentId,
          subscription: { planId: "spotlight", status: "pending_admin" },
        });
        ctx.logActivity("spotlight.oneoff", "info", req.user.uid, "One-off spotlight purchased");
        return;
      } catch (e) {
        log.error(
          { error: e?.message, stack: e?.stack },
          "Spotlight purchase failure"
        );
        return res.status(500).json({
          ok: false,
          error: "ONEOFF_SPOTLIGHT_FAILED",
          message: e?.message || String(e),
        });
      }
    }
  );
};
