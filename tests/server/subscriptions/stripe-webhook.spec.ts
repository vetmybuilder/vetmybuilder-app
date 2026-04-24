import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const webhookMount = require("../../../server/routes/subscriptions/stripe-webhook.post.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  const fakeRouter = { post: (_path: string, handler: any) => { captured = handler; } };
  webhookMount(fakeRouter, ctx);
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe("Stripe webhook — subscription events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("activates a row on checkout.session.completed with mode=subscription", async () => {
    const q = vi.fn().mockResolvedValue({ affectedRows: 1 });
    const handler = loadHandler({
      mysqlQuery: q,
      payments: {
        verifyWebhook: () => ({
          type: "checkout.session.completed",
          data: {
            object: {
              id: "sess_123",
              mode: "subscription",
              subscription: "sub_abc",
              metadata: { userId: "u1", tier: "week_1" },
              customer: "cus_xyz",
            },
          },
        }),
      },
    });
    const res = mockRes();
    await handler({ body: {}, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const insertCall = q.mock.calls.find(([sql]) =>
      /INSERT INTO builder_subscriptions/i.test(sql),
    );
    expect(insertCall).toBeTruthy();
  });

  it("sets status=canceled on customer.subscription.deleted", async () => {
    const q = vi.fn().mockResolvedValue({ affectedRows: 1 });
    const handler = loadHandler({
      mysqlQuery: q,
      payments: {
        verifyWebhook: () => ({
          type: "customer.subscription.deleted",
          data: { object: { id: "sub_abc", status: "canceled" } },
        }),
      },
    });
    const res = mockRes();
    await handler({ body: {}, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const updateCall = q.mock.calls.find(([sql]) =>
      /UPDATE builder_subscriptions.*status\s*=\s*'canceled'/is.test(sql),
    );
    expect(updateCall).toBeTruthy();
  });

  it("updates period_end on customer.subscription.updated", async () => {
    const q = vi.fn().mockResolvedValue({ affectedRows: 1 });
    const newEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const handler = loadHandler({
      mysqlQuery: q,
      payments: {
        verifyWebhook: () => ({
          type: "customer.subscription.updated",
          data: {
            object: {
              id: "sub_abc",
              status: "active",
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: newEnd,
            },
          },
        }),
      },
    });
    const res = mockRes();
    await handler({ body: {}, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 on invalid signature", async () => {
    const handler = loadHandler({
      mysqlQuery: vi.fn(),
      payments: {
        verifyWebhook: () => { throw new Error("invalid signature"); },
      },
    });
    const res = mockRes();
    await handler({ body: {}, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
