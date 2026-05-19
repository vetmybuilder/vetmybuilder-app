import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const checkoutMount = require("../../../server/routes/subscriptions/checkout.post.js");

type Handler = (req: any, res: any) => Promise<void>;

function loadHandler(ctx: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    post: (_path: string, _auth: any, handler: Handler) => {
      captured = handler;
    },
  };
  checkoutMount(fakeRouter, ctx);
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("POST /api/subscriptions/checkout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when tier is missing or unknown", async () => {
    const handler = loadHandler({
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery: vi.fn(),
      payments: { createSubscriptionCheckout: vi.fn() },
    });
    const res = mockRes();
    await handler(
      { user: { uid: "u1" }, body: { waiverAccepted: true } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/tier/i) }),
    );
  });

  it("returns 401 when user is not authed", async () => {
    const handler = loadHandler({
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery: vi.fn(),
      payments: { createSubscriptionCheckout: vi.fn() },
    });
    const res = mockRes();
    await handler({ user: null, body: { tier: "week_1" } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 200 with hosted_url on success", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "sess_123",
      hosted_url: "https://mock/checkout/sess_123",
      status: "open",
      tier: "week_1",
    });
    const handler = loadHandler({
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery: vi.fn(),
      payments: { createSubscriptionCheckout: create },
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        body: { tier: "week_1", waiverAccepted: true },
      },
      res,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", tier: "week_1" }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        hosted_url: "https://mock/checkout/sess_123",
      }),
    );
  });
});
