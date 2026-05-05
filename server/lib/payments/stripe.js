// server/lib/payments/stripe.js
/**
 * Stripe Checkout adapter. Uses Stripe's hosted checkout page.
 * Falls back to mock if STRIPE_SECRET_KEY is not set.
 */

const TAG = "[payments.stripe]";

function createStripePayments(opts = {}) {
  const log = opts.log || console;
  const secretKey = opts.secretKey || process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    log.warn?.(`${TAG} No STRIPE_SECRET_KEY — Stripe payments disabled`);
    return null;
  }

  const stripe = require("stripe")(secretKey);
  const baseUrl = String(opts.baseUrl || process.env.NEXT_PUBLIC_WEB_BASE || "http://localhost:3000").replace(/\/+$/, "");
  const mysqlQuery = opts.mysqlQuery || null;

  async function createCheckout(options = {}) {
    const items = Array.isArray(options.items) ? options.items : [];
    const metadata = options.metadata || {};

    const lineItems = items.map((item) => ({
      price_data: {
        currency: (item.price?.currency || "gbp").toLowerCase(),
        product_data: { name: item.label || "VetMyBuilder" },
        unit_amount: Number(item.price?.amount || 0),
      },
      quantity: Number(item.quantity || 1),
    }));

    const sessionParams = {
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      metadata: {
        ...metadata,
        userId: options.userId || "",
      },
      success_url: options.success_url || `${baseUrl}/payments/success?sessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: options.cancel_url || `${baseUrl}/payments/cancel?sessionId={CHECKOUT_SESSION_ID}`,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    log.info?.({ id: session.id, userId: options.userId }, `${TAG} checkout session created`);

    // Store session reference in DB for cross-shard access
    if (mysqlQuery) {
      try {
        await mysqlQuery(
          `INSERT INTO checkout_sessions (id, data, created_at, updated_at) VALUES (?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
          [session.id, JSON.stringify({
            id: session.id,
            status: session.status,
            userId: options.userId,
            items,
            total: { amount: session.amount_total, currency: session.currency },
            mode: session.mode,
            hosted_url: session.url,
            success_url: session.success_url,
            cancel_url: session.cancel_url,
            metadata,
          })]
        );
      } catch (err) {
        log.warn?.({ err: err?.message }, `${TAG} failed to store session in DB`);
      }
    }

    return {
      id: session.id,
      status: session.status,
      userId: options.userId || null,
      items,
      total: { amount: session.amount_total, currency: session.currency },
      mode: session.mode,
      hosted_url: session.url,
      success_url: session.success_url,
      cancel_url: session.cancel_url,
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function getSession(id) {
    if (!id) return null;
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      return {
        id: session.id,
        status: session.status === "complete" ? "paid" : session.status,
        userId: session.metadata?.userId || null,
        total: { amount: session.amount_total, currency: session.currency },
        mode: session.mode,
        hosted_url: session.url,
        success_url: session.success_url,
        cancel_url: session.cancel_url,
        metadata: session.metadata || {},
      };
    } catch (err) {
      log.warn?.({ err: err?.message, id }, `${TAG} getSession failed`);
      return null;
    }
  }

  async function markPaid(id) {
    // Stripe handles this via webhooks — no-op here
    return getSession(id);
  }

  async function cancel(id) {
    try {
      const session = await stripe.checkout.sessions.expire(id);
      return { id: session.id, status: "canceled" };
    } catch (err) {
      log.warn?.({ err: err?.message, id }, `${TAG} cancel failed`);
      return null;
    }
  }

  async function expire(id) {
    return cancel(id);
  }

  function listSessions() {
    return [];
  }

  function verifyWebhook({ payload, signature, secret }) {
    const webhookSecret = secret || process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return { ok: false, error: "no_webhook_secret" };
    }
    try {
      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      return { ok: true, event };
    } catch (err) {
      log.warn?.({ err: err?.message }, `${TAG} webhook verification failed`);
      return { ok: false, error: err?.message };
    }
  }

  function emitWebhook() {
    return null;
  }

  async function createSubscriptionCheckout(options = {}) {
    const { getTier } = require("../subscriptions/tiers");
    const tier = getTier(options.tier);
    if (!tier) {
      throw new Error(`Unknown subscription tier: ${options.tier}`);
    }

    const sessionParams = {
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `VetMyBuilder Visibility — ${tier.displayName}`,
            },
            recurring: {
              interval: tier.interval,
              interval_count: tier.intervalCount,
            },
            unit_amount: tier.amountPence,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: options.userId || "",
        vmb_type: "subscription",
        tier: tier.id,
      },
      success_url:
        options.success_url ||
        `${baseUrl}/payments/success?sessionId={CHECKOUT_SESSION_ID}`,
      cancel_url:
        options.cancel_url ||
        `${baseUrl}/payments/cancel?sessionId={CHECKOUT_SESSION_ID}`,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    log.info?.(
      { id: session.id, userId: options.userId, tier: tier.id },
      `${TAG} subscription checkout session created`,
    );

    return {
      id: session.id,
      hosted_url: session.url,
      status: session.status,
      tier: tier.id,
    };
  }

  async function cancelSubscriptionAtPeriodEnd(stripeSubscriptionId) {
    if (!stripeSubscriptionId) {
      throw new Error("stripeSubscriptionId required");
    }
    const sub = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    log.info?.(
      { id: sub.id },
      `${TAG} subscription set to cancel at period end`,
    );
    return { id: sub.id, cancelAtPeriodEnd: sub.cancel_at_period_end };
  }

  function verifyWebhookFromReq(req) {
    const sig = req.headers?.["stripe-signature"];
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!whSecret) throw new Error("STRIPE_WEBHOOK_SECRET not set");
    if (!sig) throw new Error("Missing stripe-signature header");
    // Express needs raw body for signature verification; the webhook route
    // is assumed to mount a raw-body parser.
    return stripe.webhooks.constructEvent(
      req.rawBody || req.body,
      sig,
      whSecret,
    );
  }

  return {
    createCheckout,
    createSession: createCheckout,
    createSubscriptionCheckout,
    cancelSubscriptionAtPeriodEnd,
    getSession,
    updateSession: async () => null,
    markPaid,
    cancel,
    expire,
    listSessions,
    verifyWebhook: verifyWebhookFromReq,
    emitWebhook,
    isStripe: true,
  };
}

module.exports = { createStripePayments };
