//
// MOCK WEBHOOK – FINAL VERSION (supports unlock_contact, spotlight, gold)
// 3-stage model: checkout → pending_admin → pending_payment → active
//

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const TAG = "[mock.webhook]";

  // ---------------------------------------------------------
  // FINALISERS
  // ---------------------------------------------------------

  //
  // 1) FINALISE ONE-OFF CONTACT UNLOCK
  //
  async function finaliseOneOffUnlock(row) {
    const { user_id, entity_id, id: paymentId } = row;

    // payments_oneoff → active
    await mysqlQuery(
      `UPDATE payments_oneoff
         SET status = 'active',
             activated_at = NOW(),
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

  //
  // 2) FINALISE SPOTLIGHT
  //
  async function finaliseSpotlight(row) {
    const { id: paymentId, user_id } = row;

    // Spotlight → active
    await mysqlQuery(
      `UPDATE payments_oneoff
         SET status = 'active',
             activated_at = NOW(),
             expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY),
             updated_at = NOW()
       WHERE id = ?`,
      [paymentId]
    );

    return {
      type: "spotlight",
      userId: user_id,
      status: "active",
    };
  }

  //
  // 3) FINALISE GOLD SUBSCRIPTION
  //
  async function finaliseSubscription(row) {
    const { buyer_uid, plan_id, id: paymentId } = row;
    const plan = String(plan_id).toLowerCase();

    if (plan !== "gold") {
      console.warn(`${TAG} ignoring unknown subscription`, plan);
      return null;
    }

    // payments_subscription → active
    await mysqlQuery(
      `
      UPDATE payments_subscription
        SET status = 'active',
            activated_at = NOW()
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

      //
      // MATCH one-off payments
      //
      const oneOffRows = await mysqlQuery(
        `
        SELECT *
        FROM payments_oneoff
        WHERE provider_session_id = ?
          AND status IN ('pending_payment','admin_approved')
        `,
        [sessionId]
      );

      //
      // MATCH subscriptions
      //
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
      return res
        .status(500)
        .json({ error: "server_error", details: e?.message });
    }
  });

  console.log("[routes] mounted: POST /payments/mock/webhook");
};
