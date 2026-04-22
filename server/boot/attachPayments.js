// server/boot/attachPayments.js
const { createMockPayments } = require("../lib/payments/mock");

/**
 * Small helper to safely pick the first non-empty string.
 */
function pick(...vals) {
  for (const v of vals) {
    if (v && typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function normalizeBaseUrl(url, fallback) {
  const u = (url || fallback || "").replace(/\/+$/, "");
  return u || "http://localhost:3000";
}

/**
 * In case a custom payments implementation is injected on ctx, we make sure
 * the shape roughly matches what the rest of the code expects.
 */
function shimInterface(payments, log) {
  if (!payments || typeof payments !== "object") return;

  const TAG = "[payments]";

  // Pick whichever creator the driver exposes
  const creator =
    payments.createSession ||
    payments.createCheckout ||
    payments.create ||
    payments.startSession ||
    payments.start ||
    payments.newSession;

  // Normalise to createSession
  if (!payments.createSession && typeof creator === "function") {
    payments.createSession = (...args) => creator.apply(payments, args);
    log.info?.(`${TAG} shimmed creator -> createSession()`);
  }

  // Warn missing methods
  const required = [
    "createCheckout",
    "markPaid",
    "cancel",
    "expire",
    "getSession",
  ];

  for (const key of required) {
    if (typeof payments[key] !== "function") {
      log.warn?.(`${TAG} missing method ${key} on payments implementation`);
    }
  }

  const has = (k) =>
    payments && typeof payments[k] === "function" ? "ok" : "missing";

  log.info?.(
    `${TAG} methods: createSession:${has("createSession")} createCheckout:${has(
      "createCheckout"
    )} getSession:${has("getSession")} markPaid:${has("markPaid")} cancel:${has(
      "cancel"
    )} expire:${has("expire")}`
  );
}

/**
 * Attach mock payments provider to ctx (if not already set)
 */
function attachPayments(ctx = {}) {
  const log = ctx.log || console;
  const TAG = "[payments]";

  if (ctx.payments) {
    log.info?.(`${TAG} existing payments instance found — leaving as-is`);
    shimInterface(ctx.payments, log);
    return ctx;
  }

  const baseUrl = normalizeBaseUrl(
    pick(
      process.env.PAYMENTS_BASE_URL,
      process.env.NEXT_PUBLIC_APP_BASE_URL,
      process.env.APP_BASE_URL,
      process.env.WEB_BASE,
      process.env.NEXT_PUBLIC_WEB_BASE
    ),
    "http://localhost:3000"
  );

  const webhookSecret =
    pick(process.env.PAYMENTS_MOCK_WEBHOOK_SECRET) || "dev_mock_secret";

  const payments = createMockPayments({
    baseUrl,
    webhookSecret,
    log,
    mysqlQuery: ctx.mysqlQuery || null,
  });

  shimInterface(payments, log);

  ctx.payments = payments;

  log.info?.(
    `${TAG} mock attached: baseUrl=${baseUrl}, webhookSecret=${
      webhookSecret ? "***" : "none"
    }`
  );

  return ctx;
}

module.exports = { attachPayments };
