// server/lib/payments/mock.js
/**
 * Lightweight in-memory payments mock for local/dev testing.
 * - No external calls.
 * - Deterministic API surface you can swap with Stripe/Adyen/etc later.
 *
 * Concepts:
 *   Session: a "checkout session" with a hosted_url (we'll mock a route later)
 *   Status: "open" | "paid" | "canceled" | "expired"
 *
 * Public methods:
 *   createCheckout(opts) -> session
 *   markPaid(sessionId) -> session
 *   cancel(sessionId) -> session
 *   expire(sessionId) -> session
 *   getSession(sessionId) -> session | null
 *   listSessions() -> session[]
 *   verifyWebhook({ payload, signature, secret }) -> { ok, event? }
 *   emitWebhook(type, session) -> event
 */

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
 * Each item: { label, price: { amount, currency }, quantity? }
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

function createMockPayments(opts = {}) {
  const baseUrl = String(opts.baseUrl || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
  const webhookSecret = opts.webhookSecret || "";

  /** @type {Record<string, any>} */
  const sessions = Object.create(null);

  /**
   * Create a new checkout session.
   *
   * opts: {
   *   userId: string;
   *   planId?: string;
   *   items?: { label, price: { amount, currency }, quantity? }[];
   *   total?: { amount, currency };
   *   mode?: "subscription" | "payment";
   *   metadata?: Record<string, any>;
   *   success_url?: string;
   *   cancel_url?: string;
   * }
   */
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
    return clone(session);
  }

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

  /**
   * Very lightweight "verification" – in real life you'd validate a signature.
   * Here we just check the provided secret matches what we were initialised with.
   */
  function verifyWebhook({ payload, signature, secret }) {
    const body =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    const expectedSecret = secret || webhookSecret || "";
    if (!expectedSecret) {
      return { ok: true, event: { type: "mock", payload: body } };
    }
    if (signature !== expectedSecret) {
      return { ok: false, error: "invalid_signature" };
    }
    return { ok: true, event: { type: "mock", payload: body } };
  }

  /**
   * Placeholder: in a real provider you'd push an event to your webhook handler.
   * Here we just log and return the event.
   */
  function emitWebhook(type, session) {
    const event = {
      id: createId("evt"),
      type,
      data: { object: clone(session) },
      created: Date.now(),
    };
    if (opts.log && typeof opts.log.info === "function") {
      opts.log.info("[payments.mock] emitWebhook", type, event.id);
    } else {
      // eslint-disable-next-line no-console
      console.log("[payments.mock] emitWebhook", type, event.id);
    }
    return event;
  }

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

// // server/lib/payments/mock.js
// /**
//  * Lightweight in-memory payments mock for local/dev testing.
//  * - No external calls.
//  * - Deterministic API surface you can swap with Stripe/Adyen/etc later.
//  *
//  * Concepts:
//  *   Session: a "checkout session" with a hosted_url (we'll mock a route later)
//  *   Status: "open" | "paid" | "canceled" | "expired"
//  *
//  * Public methods:
//  *   createCheckout(opts) -> session
//  *   markPaid(sessionId) -> session
//  *   cancel(sessionId) -> session
//  *   expire(sessionId) -> session
//  *   getSession(sessionId) -> session | null
//  *   listSessions(filter?) -> array
//  *   verifyWebhook(payload, signature) -> boolean
//  *   emitWebhook(eventName, session) -> { ok, delivered }  // no-op for now
//  */

// const crypto = require("crypto");

// /** @typedef {"open"|"paid"|"canceled"|"expired"} MockStatus */

// function nowIso() {
//   return new Date().toISOString();
// }

// function randId(prefix = "sess_") {
//   // mimic payment provider IDs
//   return prefix + crypto.randomBytes(12).toString("hex");
// }

// /**
//  * @typedef {Object} Money
//  * @property {number} amount - integer minor units (e.g. pence)
//  * @property {string} currency - e.g. "GBP"
//  */

// /**
//  * @typedef {Object} CheckoutItem
//  * @property {string} label
//  * @property {Money} price
//  * @property {number} [quantity=1]
//  */

// /**
//  * @typedef {Object} CheckoutSession
//  * @property {string} id
//  * @property {"checkout"} type
//  * @property {MockStatus} status
//  * @property {string} createdAt
//  * @property {string} updatedAt
//  * @property {string} hosted_url
//  * @property {string} success_url
//  * @property {string} cancel_url
//  * @property {string} userId
//  * @property {string} [planId]
//  * @property {CheckoutItem[]} items
//  * @property {Money} total
//  * @property {Record<string, any>} [metadata]
//  */

// /**
//  * Factory to create an isolated mock payments instance.
//  * You can create one per server process and stick it on ctx.payments.
//  *
//  * @param {Object} [opts]
//  * @param {string} [opts.baseUrl="http://localhost:3000"] - used to form hosted_url/success_url/cancel_url defaults
//  * @param {string} [opts.webhookSecret] - optional HMAC secret for "verifyWebhook"
//  * @returns {{
//  *   createCheckout: (opts: {
//  *     userId: string,
//  *     planId?: string,
//  *     items: CheckoutItem[],
//  *     success_url?: string,
//  *     cancel_url?: string,
//  *     metadata?: Record<string, any>,
//  *     ttlSeconds?: number, // auto-expire window for 'open' sessions
//  *   }) => CheckoutSession,
//  *   markPaid: (sessionId: string) => CheckoutSession,
//  *   cancel: (sessionId: string) => CheckoutSession,
//  *   expire: (sessionId: string) => CheckoutSession,
//  *   getSession: (sessionId: string) => CheckoutSession | null,
//  *   listSessions: (filter?: Partial<{ userId: string, status: MockStatus, planId: string }>) => CheckoutSession[],
//  *   verifyWebhook: (payload: string, signature: string) => boolean,
//  *   emitWebhook: (eventName: string, session: CheckoutSession) => { ok: boolean, delivered: false },
//  * }}
//  */
// function createMockPayments(opts = {}) {
//   const baseUrl = String(opts.baseUrl || process.env.MOCK_PAY_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
//   const webhookSecret = opts.webhookSecret || process.env.PAYMENTS_MOCK_WEBHOOK_SECRET || "dev_mock_secret";

//   /** @type {Map<string, CheckoutSession>} */
//   const store = new Map();

//   /** @type {Map<string, NodeJS.Timeout>} */
//   const timers = new Map();

//   function computeTotal(items) {
//     let pence = 0;
//     let currency = "GBP";
//     for (const it of items || []) {
//       const qty = Number.isFinite(it.quantity) ? it.quantity : 1;
//       pence += (it.price?.amount || 0) * qty;
//       if (it.price?.currency) currency = it.price.currency;
//     }
//     return { amount: pence, currency };
//   }

//   function publicUrl(path) {
//     return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
//   }

//   function save(sess, ttlSeconds) {
//     store.set(sess.id, sess);
//     if (timers.has(sess.id)) {
//       clearTimeout(timers.get(sess.id));
//       timers.delete(sess.id);
//     }
//     if (ttlSeconds && sess.status === "open") {
//       const t = setTimeout(() => {
//         const cur = store.get(sess.id);
//         if (cur && cur.status === "open") {
//           cur.status = "expired";
//           cur.updatedAt = nowIso();
//           store.set(cur.id, cur);
//         }
//       }, ttlSeconds * 1000);
//       timers.set(sess.id, t);
//     }
//     return sess;
//   }

//   function requireSession(id) {
//     const s = store.get(id);
//     if (!s) {
//       const e = new Error("mock_payment: session not found");
//       e.code = "PAY_SESS_NOT_FOUND";
//       throw e;
//     }
//     return s;
//   }

//   function createCheckout(input) {
//     if (!input || !input.userId) {
//       const e = new Error("mock_payment: userId required");
//       e.code = "PAY_CREATE_BAD_INPUT";
//       throw e;
//     }
//     if (!Array.isArray(input.items) || input.items.length === 0) {
//       const e = new Error("mock_payment: items required");
//       e.code = "PAY_CREATE_BAD_INPUT";
//       throw e;
//     }

//     const total = computeTotal(input.items);
//     const id = randId();
//     /** @type {CheckoutSession} */
//     const session = {
//       id,
//       type: "checkout",
//       status: "open",
//       createdAt: nowIso(),
//       updatedAt: nowIso(),
//       hosted_url: publicUrl(`/payments/mock/checkout/${id}`), // you’ll create a dev page/route later
//       success_url: input.success_url || publicUrl(`/payments/mock/success?session_id=${id}`),
//       cancel_url: input.cancel_url || publicUrl(`/payments/mock/cancel?session_id=${id}`),
//       userId: input.userId,
//       planId: input.planId,
//       items: input.items.map((it) => ({
//         label: String(it.label || "Item"),
//         price: {
//           amount: Number(it.price?.amount || 0),
//           currency: it.price?.currency || total.currency,
//         },
//         quantity: Number.isFinite(it.quantity) ? it.quantity : 1,
//       })),
//       total,
//       metadata: input.metadata || {},
//     };

//     return save(session, input.ttlSeconds || 15 * 60); // default TTL 15 min
//   }

//   function mutateStatus(id, next) {
//     const s = requireSession(id);
//     if (s.status !== next) {
//       s.status = next;
//       s.updatedAt = nowIso();
//       save(s);
//     }
//     return s;
//   }

//   function markPaid(id) {
//     return mutateStatus(id, "paid");
//   }

//   function cancel(id) {
//     return mutateStatus(id, "canceled");
//   }

//   function expire(id) {
//     return mutateStatus(id, "expired");
//   }

//   function getSession(id) {
//     return store.get(id) || null;
//   }

//   function listSessions(filter = {}) {
//     const out = [];
//     for (const s of store.values()) {
//       if (filter.userId && s.userId !== filter.userId) continue;
//       if (filter.planId && s.planId !== filter.planId) continue;
//       if (filter.status && s.status !== filter.status) continue;
//       out.push(s);
//     }
//     // newest first
//     out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
//     return out;
//   }

//   // Simple HMAC checker for parity with real providers
//   function verifyWebhook(payload, signature) {
//     try {
//       const mac = crypto.createHmac("sha256", webhookSecret).update(payload, "utf8").digest("hex");
//       // Accept either exact or "t=...,v1=..." formats where v1 is hex
//       if (!signature) return false;
//       if (signature === mac) return true;
//       const m = /(?:^|,)v1=([a-f0-9]{64})(?:,|$)/i.exec(signature);
//       return !!(m && m[1] && m[1].toLowerCase() === mac);
//     } catch {
//       return false;
//     }
//   }

//   // No-op; it returns what a dispatcher might return later
//   function emitWebhook(_eventName, _session) {
//     return { ok: true, delivered: false };
//   }

//   return {
//     createCheckout,
//     markPaid,
//     cancel,
//     expire,
//     getSession,
//     listSessions,
//     verifyWebhook,
//     emitWebhook,
//   };
// }

// module.exports = {
//   createMockPayments,
// };
