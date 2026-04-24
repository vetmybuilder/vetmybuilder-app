import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const cancelMount = require("../../../server/routes/subscriptions/cancel.post.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  const fakeRouter = {
    post: (_path: string, _auth: any, handler: any) => { captured = handler; },
  };
  cancelMount(fakeRouter, ctx);
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("POST /api/subscriptions/cancel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authed", async () => {
    const handler = loadHandler({
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery: vi.fn(),
      payments: { isStripe: false },
    });
    const res = mockRes();
    await handler({ user: null }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 404 when no active subscription exists", async () => {
    const q = vi.fn().mockResolvedValue([]);
    const handler = loadHandler({
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery: q,
      payments: { isStripe: false },
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("marks subscription as canceled and records canceled_at (mock path)", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 42, stripe_subscription_id: "mock_sub_1" },
      ])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const handler = loadHandler({
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery: q,
      payments: { isStripe: false },
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, canceled: true }),
    );
    expect(q.mock.calls[1][0]).toMatch(/UPDATE builder_subscriptions/);
  });
});
