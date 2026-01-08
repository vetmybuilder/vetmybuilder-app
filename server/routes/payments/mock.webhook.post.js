// server/routes/payments/mock.webhook.post.js
//
// MOCK WEBHOOK – FINAL VERSION (supports unlock_contact, spotlight, gold)
// 3-stage model: checkout → pending_admin → pending_payment → active
//

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const TAG = "payments.mock.webhook";

  // ---------------------------------------------------------
  // FINALISERS (unchanged logic, wrapped with logs)
  // ---------------------------------------------------------

  async function finaliseOneOffUnlock(row, log) {
    const { user_id, entity_id, id: paymentId } = row;

    log.info(
      { paymentId, user_id, projectId: entity_id },
      "Finalising one-off unlock_contact"
    );

    await mysqlQuery(
      `UPDATE payments_oneoff
         SET status = 'active',
             activated_at = NOW(),
             updated_at = NOW()
       WHERE id = ?`,
      [paymentId]
    );

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

  async function finaliseSpotlight(row, log) {
    const { id: paymentId, user_id } = row;

    log.info({ paymentId, user_id }, "Finalising spotlight");

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

  async function finaliseSubscription(row, log) {
    const { buyer_uid, plan_id, id: paymentId } = row;
    const plan = String(plan_id).toLowerCase();

    if (plan !== "gold") {
      log.warn({ plan_id }, "Ignoring unsupported subscription plan");
      return null;
    }

    log.info({ paymentId, buyer_uid }, "Finalising gold subscription");

    await mysqlQuery(
      `
      UPDATE payments_subscription
        SET status = 'active',
            activated_at = NOW()
      WHERE id = ?
      `,
      [paymentId]
    );

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
    const log = withRequest(req, logger).child({
      route: "/payments/mock/webhook",
    });

    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        log.warn("Missing sessionId in webhook");
        return res.status(400).json({ error: "sessionId required" });
      }

      log.info({ sessionId }, "Webhook triggered");

      // -----------------------------------------------------
      // FETCH MATCHING ONE-OFFS
      // -----------------------------------------------------
      const oneOffRows = await mysqlQuery(
        `
        SELECT *
        FROM payments_oneoff
        WHERE provider_session_id = ?
          AND status IN ('pending_payment','admin_approved')
        `,
        [sessionId]
      );

      log.info({ found: oneOffRows.length }, "Matched one-off payments");

      // -----------------------------------------------------
      // FETCH MATCHING SUBSCRIPTIONS
      // -----------------------------------------------------
      const subRows = await mysqlQuery(
        `
        SELECT *
        FROM payments_subscription
        WHERE provider_session_id = ?
          AND status IN ('pending_payment','admin_approved')
        `,
        [sessionId]
      );

      log.info({ found: subRows.length }, "Matched subscription payments");

      // -----------------------------------------------------
      // PROCESS
      // -----------------------------------------------------
      const processed = [];

      for (const row of oneOffRows) {
        if (row.type === "unlock_contact") {
          processed.push(await finaliseOneOffUnlock(row, log));
        } else if (row.type === "spotlight") {
          processed.push(await finaliseSpotlight(row, log));
        } else {
          log.warn({ type: row.type }, "Unknown one-off type skipped");
        }
      }

      for (const row of subRows) {
        const out = await finaliseSubscription(row, log);
        if (out) processed.push(out);
      }

      log.info({ processedCount: processed.length }, "Webhook completed");

      return res.json({
        ok: true,
        sessionId,
        processed,
      });
    } catch (e) {
      log.error(
        { error: e?.message, stack: e?.stack },
        "Webhook error occurred"
      );
      return res.status(500).json({
        error: "server_error",
        details: e?.message,
      });
    }
  });

  logger.info("[routes] mounted: POST /payments/mock/webhook");
};
