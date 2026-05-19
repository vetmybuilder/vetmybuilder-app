// server/routes/payments/stripe.webhook.post.js
//
// POST /api/stripe/webhook
//
// The single, unified Stripe webhook endpoint. Replaces the previous
// pair of routes (/api/payments/stripe/webhook for one-off events and
// /api/subscriptions/stripe-webhook for subscription events). One
// endpoint = one Stripe Dashboard config + one STRIPE_WEBHOOK_SECRET
// per env. Dispatches by event.type to handlers in
// server/lib/payments/handlers/.
//
// Verifies the signature via ctx.payments.verifyWebhook(req). The raw
// body parser is mounted inline because Stripe signature verification
// requires the un-deserialised body.
//
// Handler injection: if ctx._handlers is provided (used in tests), those
// functions are used in place of the real module requires. In production
// ctx._handlers is absent and the real handlers are required normally.

const express = require("express");
const { activateUnlock } = require("../../lib/payments/handlers/activateUnlock");
const {
  subscriptionCheckoutCompleted,
} = require("../../lib/payments/handlers/subscriptionCheckoutCompleted");
const {
  subscriptionUpdated,
} = require("../../lib/payments/handlers/subscriptionUpdated");
const {
  subscriptionDeleted,
} = require("../../lib/payments/handlers/subscriptionDeleted");

const defaultHandlers = {
  activateUnlock,
  subscriptionCheckoutCompleted,
  subscriptionUpdated,
  subscriptionDeleted,
};

module.exports = (router, ctx) => {
  const TAG = "[stripe-webhook]";
  const log = ctx.log || console;
  const handlers = { ...defaultHandlers, ...(ctx._handlers || {}) };

  router.post(
    "/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      if (!ctx.payments?.isStripe) {
        return res.status(200).json({ ok: true, skipped: true });
      }

      let event;
      try {
        event = ctx.payments.verifyWebhook(req);
      } catch (err) {
        log.warn?.({ err: err?.message }, `${TAG} signature verification failed`);
        return res.status(400).json({ error: "invalid_signature" });
      }

      log.info?.({ type: event.type, id: event.id }, `${TAG} received`);

      try {
        const obj = event?.data?.object || {};
        if (event.type === "checkout.session.completed") {
          if (obj.mode === "subscription") {
            await handlers.subscriptionCheckoutCompleted({ event, ctx });
          } else {
            await handlers.activateUnlock({ event, ctx });
          }
        } else if (event.type === "customer.subscription.updated") {
          await handlers.subscriptionUpdated({ event, ctx });
        } else if (event.type === "customer.subscription.deleted") {
          await handlers.subscriptionDeleted({ event, ctx });
        }
        // Unknown event types: 200 no-op so Stripe stops retrying.
        return res.status(200).json({ received: true });
      } catch (err) {
        log.error?.({ err: err?.message, type: event.type }, `${TAG} handler failed`);
        return res.status(500).json({ error: "handler_failed" });
      }
    },
  );
};
