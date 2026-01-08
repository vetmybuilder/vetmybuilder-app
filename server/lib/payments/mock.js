// server/lib/payments/mock.js
/**
 * Lightweight in-memory payments mock for local/dev testing.
 */

const TAG = "[payments.mock]";

/* ----------------------- helpers ----------------------- */

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

/**
 * Compute the total in minor units (pence) from items.
 */
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

/* ----------------------- main factory ----------------------- */

function createMockPayments(opts = {}) {
  const log = opts.log || console; // logger or fallback

  const baseUrl = String(opts.baseUrl || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
  const webhookSecret = opts.webhookSecret || "";

  /** @type {Record<string, any>} */
  const sessions = Object.create(null);

  /* ------------------- create checkout session ------------------- */

  function createCheckout(options = {}) {
    const id = createId("cs_test");
    const createdAt = nowIso();
    const items = Array.isArray(options.items) ? options.items.slice() : [];
    const total =
      options.total && typeof options.total.amount === "number"
        ? {
            amount: Number(options.total.amount) || 0,
            currency: String(options.total.currency || "GBP").toUpperCase(),
          }
        : computeTotal(items);

    const session = {
      id,
      status: "open",
      userId: options.userId || null,
      planId: options.planId || null,
      items,
      total,
      mode: options.mode || (options.planId ? "subscription" : "payment"),
      hosted_url: `${baseUrl}/payments/mock/checkout/${id}`,
      success_url:
        options.success_url ||
        `${baseUrl}/payments/mock/success?sessionId=${id}`,
      cancel_url:
        options.cancel_url || `${baseUrl}/payments/mock/cancel?sessionId=${id}`,
      metadata: options.metadata || {},
      createdAt,
      updatedAt: createdAt,
    };

    sessions[id] = session;

    log.info(
      { id, userId: session.userId, planId: session.planId },
      `${TAG} createCheckout`
    );

    return clone(session);
  }

  /* ------------------- session helpers ------------------- */

  function getSession(id) {
    if (!id) return null;
    const s = sessions[id];
    return s ? clone(s) : null;
  }

  function updateSession(id, patch) {
    const s = sessions[id];
    if (!s) return null;

    const updated = {
      ...s,
      ...patch,
      updatedAt: nowIso(),
    };

    sessions[id] = updated;

    log.info({ id, status: updated.status }, `${TAG} updateSession`);

    return clone(updated);
  }

  function markPaid(id) {
    return updateSession(id, { status: "paid" });
  }

  function cancel(id) {
    return updateSession(id, { status: "canceled" });
  }

  function expire(id) {
    return updateSession(id, { status: "expired" });
  }

  function listSessions() {
    return Object.keys(sessions).map((id) => clone(sessions[id]));
  }

  /* ------------------- webhook helpers ------------------- */

  function verifyWebhook({ payload, signature, secret }) {
    const body =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    const expectedSecret = secret || webhookSecret || "";

    if (!expectedSecret) {
      log.info(`${TAG} verifyWebhook no secret → auto-ok`);
      return { ok: true, event: { type: "mock", payload: body } };
    }

    if (signature !== expectedSecret) {
      log.warn(`${TAG} invalid webhook signature`);
      return { ok: false, error: "invalid_signature" };
    }

    log.info(`${TAG} webhook verified`);
    return { ok: true, event: { type: "mock", payload: body } };
  }

  function emitWebhook(type, session) {
    const event = {
      id: createId("evt"),
      type,
      data: { object: clone(session) },
      created: Date.now(),
    };

    log.info(
      { eventId: event.id, type, sessionId: session.id },
      `${TAG} emitWebhook`
    );

    return event;
  }

  /* ------------------- public API ------------------- */

  return {
    createCheckout,
    markPaid,
    cancel,
    expire,
    getSession,
    listSessions,
    verifyWebhook,
    emitWebhook,
  };
}

module.exports = {
  createMockPayments,
};
