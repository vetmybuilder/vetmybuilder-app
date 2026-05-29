import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/projects/unlock-contact.checkout.post.js");
const { loadFlags, clearFlagCache } = require("../../server/lib/featureFlags");

// Payments flag ON: the waiver gate only runs once payments are enabled.
// Prime the shared flag cache so isFlagEnabled returns true without a DB.
async function enablePayments() {
  clearFlagCache();
  await loadFlags(async () => [{ flag_key: "payments", enabled: 1 }]);
}

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

// CCR 2013: tradespeople must explicitly waive their 14-day cancellation
// right before we hit Stripe. The gate fires before any DB or Stripe
// work, so these tests only need to verify the early rejection.
describe("POST /api/projects/:id/unlock-contact/checkout - waiver gate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await enablePayments();
  });
  afterAll(() => clearFlagCache());

  const baseCtx = () => ({
    auth: (_q: any, _r: any, n: any) => n(),
    mysqlQuery: vi.fn(),
    payments: {
      isStripe: false,
      createSession: vi.fn(),
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    logActivity: vi.fn(),
  });

  it("rejects with waiver_required when waiverAccepted is missing", async () => {
    const handler = loadHandler(baseCtx());
    const res = mockRes();
    await handler(
      { user: { uid: "u-trade-1" }, params: { id: "42" }, body: {} },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "waiver_required" });
  });

  it("rejects when waiverAccepted is truthy but not exactly true", async () => {
    const handler = loadHandler(baseCtx());
    const res = mockRes();
    await handler(
      {
        user: { uid: "u-trade-1" },
        params: { id: "42" },
        body: { waiverAccepted: "yes" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "waiver_required" });
  });

  it("returns 401 first if there is no authed user (waiver check does not bypass auth)", async () => {
    const handler = loadHandler(baseCtx());
    const res = mockRes();
    await handler(
      { user: null, params: { id: "42" }, body: { waiverAccepted: true } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
