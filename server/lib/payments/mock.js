// server/lib/payments/mock.js
/**
 * Mock payments backed by MySQL checkout_sessions table.
 * Sessions persist across server restarts and are shared across shards.
 */

const { syncSubscriptionCache } = require("../subscriptions/syncSubscriptionCache");

const TAG = "[payments.mock]";

function createId(prefix) {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}${rand}`;
}

function nowIso() {
  return new Date().toISOString();
}

function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

function computeTotal(items) {
  if (!Array.isArray(items) || !items.length) {
    return { amount: 0, currency: "GBP" };
  }
  const currency = String(items[0].price?.currency || "GBP").toUpperCase();
  let amount = 0;
  for (const it of items) {
    const qty = Number(it.quantity == null ? 1 : it.quantity) || 1;
    const priceMinor = Number(it.price?.amount || 0) || 0;
    amount += priceMinor * qty;
  }
  return { amount, currency };
}

function createMockPayments(opts = {}) {
  const log = opts.log || console;
  const mysqlQuery = opts.mysqlQuery || null;
  const baseUrl = String(opts.baseUrl || "http://localhost:3000").replace(/\/+$/, "");
  const webhookSecret = opts.webhookSecret || "";

  // Fallback in-memory store when no MySQL available
  const memStore = Object.create(null);

  async function dbSave(id, data) {
    if (!mysqlQuery) { memStore[id] = data; return; }
    try {
      await mysqlQuery(
        `INSERT INTO checkout_sessions (id, data, created_at, updated_at) VALUES (?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
        [id, JSON.stringify(data)]
      );
    } catch (err) {
      log.warn?.({ err: err?.message }, `${TAG} dbSave failed, using memory`);
      memStore[id] = data;
    }
  }

  async function dbGet(id) {
    if (!mysqlQuery) return memStore[id] ? clone(memStore[id]) : null;
    try {
      const rows = await mysqlQuery("SELECT data FROM checkout_sessions WHERE id = ?", [id]);
      if (!rows.length) return memStore[id] ? clone(memStore[id]) : null;
      const parsed = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
      return parsed;
    } catch (err) {
      log.warn?.({ err: err?.message }, `${TAG} dbGet failed, using memory`);
      return memStore[id] ? clone(memStore[id]) : null;
    }
  }

  async function createCheckout(options = {}) {
    const id = createId("cs_test");
    const createdAt = nowIso();
    const items = Array.isArray(options.items) ? options.items.slice() : [];
    const total =
      options.total && typeof options.total.amount === "number"
        ? { amount: Number(options.total.amount) || 0, currency: String(options.total.currency || "GBP").toUpperCase() }
        : computeTotal(items);

    const session = {
      id,
      status: "open",
      userId: options.userId || null,
      planId: options.planId || null,
      items,
      total,
      mode: options.mode || (options.planId ? "subscription" : "payment"),
      hosted_url: `/payments/mock/checkout/${id}`,
      success_url: options.success_url || `/payments/mock/success?sessionId=${id}`,
      cancel_url: options.cancel_url || `/payments/mock/cancel?sessionId=${id}`,
      metadata: options.metadata || {},
      createdAt,
      updatedAt: createdAt,
    };

    memStore[id] = session;
    await dbSave(id, session);

    log.info?.({ id, userId: session.userId, planId: session.planId }, `${TAG} createCheckout`);
    return clone(session);
  }

  async function getSession(id) {
    if (!id) return null;
    return dbGet(id);
  }

  async function updateSession(id, patch) {
    const s = await dbGet(id);
    if (!s) return null;
    const updated = { ...s, ...patch, updatedAt: nowIso() };
    memStore[id] = updated;
    await dbSave(id, updated);
    log.info?.({ id, status: updated.status }, `${TAG} updateSession`);
    return clone(updated);
  }

  async function markPaid(id) {
    return updateSession(id, { status: "paid" });
  }

  async function cancel(id) {
    return updateSession(id, { status: "canceled" });
  }

  async function expire(id) {
    return updateSession(id, { status: "expired" });
  }

  function listSessions() {
    return Object.keys(memStore).map((id) => clone(memStore[id]));
  }

  function verifyWebhookFromPayload({ payload, signature, secret }) {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const expectedSecret = secret || webhookSecret || "";
    if (!expectedSecret) {
      log.info?.(`${TAG} verifyWebhookFromPayload no secret - auto-ok`);
      return { ok: true, event: { type: "mock", payload: body } };
    }
    if (signature !== expectedSecret) {
      log.warn?.(`${TAG} invalid webhook signature`);
      return { ok: false, error: "invalid_signature" };
    }
    log.info?.(`${TAG} webhook verified`);
    return { ok: true, event: { type: "mock", payload: body } };
  }

  function verifyWebhookFromReq(_req) {
    // Mock provider has no real webhook; return an inert event so the
    // webhook route can no-op cleanly if ever hit in test/dev.
    return { type: "mock.noop", data: { object: {} } };
  }

  function emitWebhook(type, session) {
    const event = { id: createId("evt"), type, data: { object: clone(session) }, created: Date.now() };
    log.info?.({ eventId: event.id, type }, `${TAG} emitWebhook`);
    return event;
  }

  async function createSubscriptionCheckout(options = {}) {
    const { getTier } = require("../subscriptions/tiers");
    const tier = getTier(options.tier);
    if (!tier) throw new Error(`Unknown subscription tier: ${options.tier}`);
    const userId = options.userId;
    if (!userId) throw new Error("createSubscriptionCheckout: userId required");

    const sessionId = `mock_sub_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const now = new Date();
    const periodEnd = new Date(now);
    if (tier.interval === "week") {
      periodEnd.setDate(periodEnd.getDate() + 7 * tier.intervalCount);
    } else if (tier.interval === "month") {
      periodEnd.setMonth(periodEnd.getMonth() + tier.intervalCount);
    }

    if (mysqlQuery) {
      await mysqlQuery(
        `INSERT INTO builder_subscriptions
           (user_id, tier_id, stripe_subscription_id, status, current_period_start, current_period_end)
         VALUES (?, ?, ?, 'active', ?, ?)`,
        [userId, tier.id, sessionId, now, periodEnd],
      );
      // Keep tradesmen.subscription_status (denormalised cache) aligned
      // with the live state so reads from either column agree.
      await syncSubscriptionCache({ mysqlQuery, userId, log });
    }

    log.info?.(
      { id: sessionId, userId, tier: tier.id },
      `${TAG} mock subscription activated`,
    );

    return {
      id: sessionId,
      hosted_url: `${baseUrl}/payments/mock/subscription-success?sessionId=${sessionId}`,
      status: "complete",
      tier: tier.id,
    };
  }

  async function cancelSubscriptionAtPeriodEnd(stripeSubscriptionId) {
    if (mysqlQuery) {
      // Look up the user before mutating so we know who to re-sync.
      let userId = null;
      try {
        const rows = await mysqlQuery(
          `SELECT user_id FROM builder_subscriptions
            WHERE stripe_subscription_id = ?
            LIMIT 1`,
          [stripeSubscriptionId],
        );
        userId = rows?.[0]?.user_id || null;
      } catch (e) {
        log.warn?.(`${TAG} cancel: lookup failed: ${e?.message || e}`);
      }
      await mysqlQuery(
        `UPDATE builder_subscriptions
            SET status = 'canceled', canceled_at = NOW()
          WHERE stripe_subscription_id = ?`,
        [stripeSubscriptionId],
      );
      if (userId) {
        await syncSubscriptionCache({ mysqlQuery, userId, log });
      }
    }
    return { id: stripeSubscriptionId, cancelAtPeriodEnd: true };
  }

  // Synthetic refund - no real Stripe call. The `pi_force_error` /
  // `ch_force_error` magic IDs let admin-refund tests exercise the
  // error path without a real Stripe failure.
  async function createRefund({
    paymentIntentId,
    chargeId,
    amountPence,
  } = {}) {
    if (paymentIntentId === "pi_force_error" || chargeId === "ch_force_error") {
      throw new Error("mock Stripe refund failure (forced)");
    }
    return {
      id: `re_mock_${Date.now()}`,
      status: "succeeded",
      amount: amountPence || 999,
      payment_intent: paymentIntentId || null,
      charge: chargeId || null,
    };
  }

  return {
    createCheckout,
    createSession: createCheckout,
    createSubscriptionCheckout,
    cancelSubscriptionAtPeriodEnd,
    getSession,
    updateSession,
    markPaid,
    cancel,
    expire,
    listSessions,
    verifyWebhook: verifyWebhookFromReq,
    emitWebhook,
    createRefund,
    isStripe: false,
  };
}

module.exports = { createMockPayments };
