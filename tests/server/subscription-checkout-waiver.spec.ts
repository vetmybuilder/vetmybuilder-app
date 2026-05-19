import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/subscriptions/checkout.post.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  mount(
    {
      post: (_p: string, _a: any, h: any) => {
        captured = h;
      },
    },
    ctx,
  );
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("POST /api/subscriptions/checkout - waiver gate", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseCtx = () => ({
    auth: (_q: any, _r: any, n: any) => n(),
    payments: {
      isStripe: false,
      createSubscriptionCheckout: vi.fn(),
    },
  });

  it("rejects with waiver_required when waiverAccepted is missing", async () => {
    const handler = loadHandler(baseCtx());
    const res = mockRes();
    await handler({ user: { uid: "u-trade-1" }, body: { tier: "month_1" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "waiver_required" });
  });

  it("rejects when waiverAccepted is truthy but not exactly true", async () => {
    const handler = loadHandler(baseCtx());
    const res = mockRes();
    await handler(
      {
        user: { uid: "u-trade-1" },
        body: { tier: "month_1", waiverAccepted: "yes" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "waiver_required" });
  });

  it("returns 401 first if there is no authed user", async () => {
    const handler = loadHandler(baseCtx());
    const res = mockRes();
    await handler({ user: null, body: { tier: "month_1", waiverAccepted: true } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
