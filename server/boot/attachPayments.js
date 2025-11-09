// server/boot/attachPayments.js
const { createMockPayments } = require("../lib/payments/mock");

function pick(...vals) {
  for (const v of vals) if (v && typeof v === "string" && v.trim()) return v.trim();
  return null;
}
function normalizeBaseUrl(url, fallback) {
  const u = (url || fallback || "").replace(/\/+$/, "");
  return u || "http://localhost:3000";
}

function shimInterface(payments, log) {
  if (!payments || typeof payments !== "object") return;

  // Find whichever creator the driver exposes
  const creator =
    payments.createSession ||
    payments.createCheckout ||   // ← added
    payments.create ||
    payments.startSession ||
    payments.start ||
    payments.newSession;

  // Normalise to createSession so all routes can rely on it later
  if (!payments.createSession && typeof creator === "function") {
    payments.createSession = (...args) => creator.apply(payments, args);
    log?.info?.("[payments] shimmed creator -> createSession()");
  }

  const has = (k) =>
    payments && typeof payments[k] === "function" ? "ok" : "missing";
  log?.info?.(
    `[payments] methods: createSession:${has("createSession")} createCheckout:${has(
      "createCheckout"
    )} getSession:${has("getSession")} markPaid:${has("markPaid")} cancel:${has(
      "cancel"
    )}`
  );
}

function attachPayments(ctx = {}) {
  const log = ctx.log || console;

  if (ctx.payments) {
    log.info?.("[payments] existing payments instance found — leaving as-is");
    shimInterface(ctx.payments, log);
    return ctx;
  }

  const baseUrl = normalizeBaseUrl(
    pick(process.env.WEB_BASE, process.env.NEXT_PUBLIC_WEB_BASE),
    "http://localhost:3000"
  );
  const webhookSecret =
    pick(process.env.PAYMENTS_MOCK_WEBHOOK_SECRET) || "dev_mock_secret";

  const payments = createMockPayments({ baseUrl, webhookSecret });
  shimInterface(payments, log);

  ctx.payments = payments;
  log.info?.(
    `[payments] mock attached (baseUrl=${baseUrl}, webhookSecret=${webhookSecret ? "***" : "none"})`
  );
  return ctx;
}

module.exports = { attachPayments };
