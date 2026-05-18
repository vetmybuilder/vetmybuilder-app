import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// vi.mock() does not intercept CJS require() in this project's Vitest/CJS setup.
// Handlers are injected via ctx._handlers instead (explicit DI, same seam as
// the rest of the codebase). All 7 test cases from the spec are preserved.

function buildApp(eventTypeToReturn: string, objMode = "payment", overrideCtx: any = {}) {
  const activateUnlockMock = overrideCtx._handlers?.activateUnlock ?? vi.fn().mockResolvedValue(undefined);
  const subscriptionCheckoutCompletedMock = overrideCtx._handlers?.subscriptionCheckoutCompleted ?? vi.fn().mockResolvedValue(undefined);
  const subscriptionUpdatedMock = overrideCtx._handlers?.subscriptionUpdated ?? vi.fn().mockResolvedValue(undefined);
  const subscriptionDeletedMock = overrideCtx._handlers?.subscriptionDeleted ?? vi.fn().mockResolvedValue(undefined);

  const app = express();
  const router = express.Router();
  const ctx: any = {
    mysqlQuery: vi.fn(),
    payments: {
      isStripe: true,
      verifyWebhook: () => ({
        id: "evt_test",
        type: eventTypeToReturn,
        data: { object: { mode: objMode, metadata: {} } },
      }),
    },
    log: console,
    _handlers: {
      activateUnlock: activateUnlockMock,
      subscriptionCheckoutCompleted: subscriptionCheckoutCompletedMock,
      subscriptionUpdated: subscriptionUpdatedMock,
      subscriptionDeleted: subscriptionDeletedMock,
    },
    ...overrideCtx,
  };
  require("../../../server/routes/payments/stripe.webhook.post")(router, ctx);
  app.use("/api", router);
  return { app, mocks: ctx._handlers };
}

describe("POST /api/stripe/webhook (unified)", () => {
  it("dispatches checkout.session.completed (payment mode) to activateUnlock", async () => {
    const { app, mocks } = buildApp("checkout.session.completed", "payment");
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "sig_test")
      .send("{}");
    expect(res.status).toBe(200);
    expect(mocks.activateUnlock).toHaveBeenCalledOnce();
    expect(mocks.subscriptionCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("dispatches checkout.session.completed (subscription mode) to subscriptionCheckoutCompleted", async () => {
    const { app, mocks } = buildApp("checkout.session.completed", "subscription");
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "sig_test")
      .send("{}");
    expect(res.status).toBe(200);
    expect(mocks.subscriptionCheckoutCompleted).toHaveBeenCalledOnce();
    expect(mocks.activateUnlock).not.toHaveBeenCalled();
  });

  it("dispatches customer.subscription.updated", async () => {
    const { app, mocks } = buildApp("customer.subscription.updated");
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "sig_test")
      .send("{}");
    expect(res.status).toBe(200);
    expect(mocks.subscriptionUpdated).toHaveBeenCalledOnce();
  });

  it("dispatches customer.subscription.deleted", async () => {
    const { app, mocks } = buildApp("customer.subscription.deleted");
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "sig_test")
      .send("{}");
    expect(res.status).toBe(200);
    expect(mocks.subscriptionDeleted).toHaveBeenCalledOnce();
  });

  it("returns 200 no-op on unknown event types", async () => {
    const { app, mocks } = buildApp("invoice.payment_succeeded");
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "sig_test")
      .send("{}");
    expect(res.status).toBe(200);
    expect(mocks.activateUnlock).not.toHaveBeenCalled();
    expect(mocks.subscriptionCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("returns 400 when verifyWebhook throws", async () => {
    const app = express();
    const router = express.Router();
    const ctx: any = {
      mysqlQuery: vi.fn(),
      payments: {
        isStripe: true,
        verifyWebhook: () => {
          throw new Error("bad sig");
        },
      },
      log: console,
    };
    require("../../../server/routes/payments/stripe.webhook.post")(router, ctx);
    app.use("/api", router);
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "bad")
      .send("{}");
    expect(res.status).toBe(400);
  });

  it("returns 200 skipped when payments.isStripe is false (mock provider)", async () => {
    const app = express();
    const router = express.Router();
    const ctx: any = {
      mysqlQuery: vi.fn(),
      payments: { isStripe: false },
      log: console,
    };
    require("../../../server/routes/payments/stripe.webhook.post")(router, ctx);
    app.use("/api", router);
    const res = await request(app).post("/api/stripe/webhook").send("{}");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, skipped: true });
  });
});
