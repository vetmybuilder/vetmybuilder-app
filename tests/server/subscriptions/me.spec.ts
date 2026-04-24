import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const meMount = require("../../../server/routes/subscriptions/me.get.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  const fakeRouter = {
    get: (_path: string, _auth: any, handler: any) => { captured = handler; },
  };
  meMount(fakeRouter, ctx);
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("GET /api/subscriptions/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authed", async () => {
    const handler = loadHandler({
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler({ user: null }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns { subscribed: false } when no active row", async () => {
    const q = vi.fn().mockResolvedValue([]);
    const handler = loadHandler({
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" } }, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ subscribed: false }),
    );
  });

  it("returns subscribed + tier + periodEnd when active row exists", async () => {
    const future = new Date(Date.now() + 86_400_000);
    const q = vi.fn().mockResolvedValue([
      {
        tier_id: "month_1",
        status: "active",
        current_period_end: future,
        canceled_at: null,
      },
    ]);
    const handler = loadHandler({
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" } }, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        subscribed: true,
        tier: "month_1",
        status: "active",
      }),
    );
  });
});
