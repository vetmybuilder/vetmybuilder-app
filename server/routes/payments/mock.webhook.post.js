// server/routes/payments/mock.webhook.post.js
//
// FINAL MOCK WEBHOOK – updated to match your DB schema (no activated_at)
//

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const TAG = "[mock.webhook]";

  // ---------------------------------------------------------
  // FINALISERS
  // ---------------------------------------------------------

  async function finaliseOneOffUnlock(row) {
    const { user_id, entity_id, id: paymentId } = row;

    // payments_oneoff → active
    await mysqlQuery(
      `UPDATE payments_oneoff
         SET status = 'active',
             updated_at = NOW()
       WHERE id = ?`,
      [paymentId]
    );

    // project_contact_unlocks → active
    await mysqlQuery(
      `UPDATE project_contact_unlocks
         SET status = 'active',
             updated_at = NOW()
       WHERE project_id = ?
         AND buyer_uid = ?`,
      [entity_id, user_id]
    );

    return {
      type: "unlock_contact",
      projectId: entity_id,
      userId: user_id,
      status: "active",
    };
  }

  async function finaliseSpotlight(row) {
    const { id: paymentId } = row;

    await mysqlQuery(
      `UPDATE payments_oneoff
         SET status = 'active',
             updated_at = NOW()
       WHERE id = ?`,
      [paymentId]
    );

    return {
      type: "spotlight",
      userId: row.user_id,
      status: "active",
    };
  }

  async function finaliseSubscription(row) {
    const { buyer_uid, plan_id, id: paymentId } = row;
    const plan = String(plan_id).toLowerCase();

    if (plan !== "gold") {
      console.warn(`${TAG} ignoring unknown subscription`, plan);
      return null;
    }

    await mysqlQuery(
      `
      UPDATE payments_subscription
        SET status = 'active'
      WHERE id = ?
      `,
      [paymentId]
    );

    // tradesmen → apply subscription
    await mysqlQuery(
      `
      UPDATE tradesmen
         SET plan                = 'gold',
             purchased_plan      = NULL,
             subscription_status = 'active',
             plan_update_at      = DATE_ADD(NOW(), INTERVAL 30 DAY),
             plan_updated_at     = NOW(),
             updated_at          = NOW()
       WHERE user_id = ?
      `,
      [buyer_uid]
    );

    return {
      type: "subscription",
      plan: "gold",
      userId: buyer_uid,
      status: "active",
    };
  }

  // ---------------------------------------------------------
  // WEBHOOK ENDPOINT
  // ---------------------------------------------------------

  router.post("/payments/mock/webhook", auth, async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId)
        return res.status(400).json({ error: "sessionId required" });

      // Look up matching rows in BOTH tables for both statuses
      const oneOffRows = await mysqlQuery(
        `
        SELECT *
        FROM payments_oneoff
        WHERE provider_session_id = ?
          AND status IN ('pending_payment','admin_approved')
        `,
        [sessionId]
      );

      const subRows = await mysqlQuery(
        `
        SELECT *
        FROM payments_subscription
        WHERE provider_session_id = ?
          AND status IN ('pending_payment','admin_approved')
        `,
        [sessionId]
      );

      let results = [];

      // FINALISE ONE-OFFS
      for (const row of oneOffRows) {
        if (row.type === "unlock_contact") {
          results.push(await finaliseOneOffUnlock(row));
        } else if (row.type === "spotlight") {
          results.push(await finaliseSpotlight(row));
        }
      }

      // FINALISE SUBSCRIPTIONS
      for (const row of subRows) {
        const r = await finaliseSubscription(row);
        if (r) results.push(r);
      }

      return res.json({
        ok: true,
        sessionId,
        processed: results,
      });
    } catch (e) {
      console.error(`${TAG} error`, e);
      return res.status(500).json({
        error: "server_error",
        details: e?.message,
      });
    }
  });

  console.log("[routes] mounted: POST /payments/mock/webhook");
};
