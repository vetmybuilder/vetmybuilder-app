// server/routes/payments/stripe-webhook.post.js
/**
 * POST /api/payments/stripe/webhook
 * Handles Stripe webhook events (checkout.session.completed).
 * No auth — Stripe sends webhooks directly.
 */
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { mysqlQuery, payments } = ctx;
  const TAG = "[stripe-webhook]";

  // Raw body parser for webhook signature verification
  const express = require("express");

  router.post(
    "/payments/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const log = withRequest(req, logger).child({ route: TAG });

      if (!payments?.isStripe) {
        return res.status(200).json({ ok: true, skipped: true });
      }

      const sig = req.headers["stripe-signature"];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        log.warn("No STRIPE_WEBHOOK_SECRET configured");
        return res.status(400).json({ error: "webhook_secret_not_configured" });
      }

      let event;
      try {
        const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        log.warn({ err: err?.message }, "Webhook signature verification failed");
        return res.status(400).json({ error: "invalid_signature" });
      }

      log.info({ type: event.type, id: event.id }, "Webhook received");

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const metadata = session.metadata || {};
        const type = metadata.type || metadata.vmb_type;
        const uid = metadata.buyerUid || metadata.userId;
        const projectId = Number(metadata.projectId || metadata.vmb_project_id);

        if (type === "unlock_contact" && uid && projectId) {
          const amount = session.amount_total || 0;
          const currency = (session.currency || "gbp").toUpperCase();

          try {
            await mysqlQuery(
              `INSERT INTO project_contact_unlocks
                (project_id, buyer_uid, session_id, amount, currency, status, created_at, approved_at)
               VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())
               ON DUPLICATE KEY UPDATE status = 'active', approved_at = NOW()`,
              [projectId, uid, session.id, amount, currency]
            );

            await mysqlQuery(
              `INSERT INTO payments_oneoff
                (user_id, type, entity_id, amount, currency, status, provider_session_id, provider_payment_intent, created_at)
               SELECT ?, 'unlock_contact', ?, ?, ?, 'active', ?, ?, NOW()
               FROM DUAL WHERE NOT EXISTS (
                 SELECT 1 FROM payments_oneoff WHERE user_id = ? AND type = 'unlock_contact' AND entity_id = ?
               )`,
              [uid, projectId, amount, currency, session.id, session.payment_intent, uid, projectId]
            );

            log.info({ uid, projectId, sessionId: session.id }, "Unlock activated via Stripe webhook");
            ctx.logActivity?.("payment.stripe.unlock", "info", uid, `Stripe unlock for project #${projectId}`);

            // Insert inbox_messages row so the homeowner sees the profile share + builder intro.
            try {
              const introMessage = metadata.introMessage || "";
              const pRows = await mysqlQuery(
                `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
                [projectId]
              );
              const ownerUid = pRows?.[0]?.ownerUserId;
              if (ownerUid) {
                await mysqlQuery(
                  `INSERT INTO inbox_messages
                     (project_id, homeowner_uid, builder_uid, intro_message, source)
                   VALUES (?, ?, ?, ?, 'paid_unlock')
                   ON DUPLICATE KEY UPDATE
                     intro_message = VALUES(intro_message),
                     updated_at = NOW()`,
                  [projectId, ownerUid, uid, introMessage]
                );
              }
            } catch (inboxErr) {
              log.warn({ err: inboxErr?.message }, "inbox_messages insert failed in stripe webhook");
            }
          } catch (err) {
            log.error({ err: err?.message }, "Failed to process unlock webhook");
          }
        }
      }

      res.json({ received: true });
    }
  );
};
