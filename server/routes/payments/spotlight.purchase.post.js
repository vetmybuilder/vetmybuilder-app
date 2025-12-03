/**
 * POST /api/payments/spotlight/purchase
 *
 * Creates a pending_admin Spotlight one-off purchase request.
 * Does NOT activate spotlight, does NOT charge money.
 * Admin must approve → then payment is taken → then spotlight becomes active.
 */

module.exports = (router, ctx) => {
  const { auth, requireTradesman, mysqlQuery } = ctx;

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // Helper: get most recent Spotlight purchase
  async function getLatestSpotlight(userId) {
    const rows = await mysqlQuery(
      `
      SELECT id, status, created_at
      FROM payments_oneoff
      WHERE user_id = ?
        AND type = 'spotlight'
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId]
    );
    return rows.length ? rows[0] : null;
  }

  router.post(
    "/payments/spotlight/purchase",
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
            message: "userId must be provided or available via auth",
          });
        }

        // convert monetary values
        const totalAmount = Number(amount) || null;
        const totalCurrency = String(currency || "GBP").toUpperCase();
        const sessionId = provider_session_id || null;
        const paymentIntent = provider_payment_intent || null;

        // Check last spotlight attempt (not an error, only FYI)
        const latest = await getLatestSpotlight(userId);
        const alreadyActive = latest && latest.status === "active";

        // Insert new pending_admin Spotlight request
        const result = await mysqlQuery(
          `
          INSERT INTO payments_oneoff
            (user_id, type, entity_id, amount, currency, status,
             provider_session_id, provider_payment_intent,
             expires_at, created_at)
          VALUES
            (?, 'spotlight', NULL, ?, ?, 'pending_admin',
             ?, ?, NULL, NOW())
          `,
          [userId, totalAmount, totalCurrency, sessionId, paymentIntent]
        );

        const paymentId = result.insertId;

        return res.json({
          ok: true,
          paymentId,
          spotlight: {
            pending: true,
            alreadyActive, // UI only, admin enforce rule C
          },
        });
      } catch (err) {
        console.error("[spotlight.purchase] error:", err);
        return res.status(500).json({
          ok: false,
          error: "SPOTLIGHT_PURCHASE_FAILED",
          message: err?.message || String(err),
        });
      }
    }
  );
};
