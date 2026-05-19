import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// requireAdmin is invoked as middleware on the route mount; stub it to
// a no-op pass-through so the handler itself is what we're testing.
vi.mock("../../server/lib/roles", () => ({
  requireAdmin: () => (_q: any, _r: any, n: any) => n(),
}));

function loadHandler(mount: any, ctx: any, verb: "post" | "get" = "post") {
  let captured: any = null;
  const router: any = {
    post: (...args: any[]) => {
      if (verb === "post") captured = args[args.length - 1];
    },
    get: (...args: any[]) => {
      if (verb === "get") captured = args[args.length - 1];
    },
  };
  mount(router, ctx);
  if (!captured) throw new Error(`handler not captured for ${verb}`);
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const mountPost = require("../../server/routes/admin/refunds.post.js");
const mountGet = require("../../server/routes/admin/refunds.get.js");

describe("POST /api/admin/refunds", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseCtx = () => {
    const queries: any[] = [];
    return {
      ctx: {
        auth: (_q: any, _r: any, n: any) => n(),
        mysqlQuery: vi.fn(async (...args: any[]) => {
          queries.push(args);
          return { insertId: 1 };
        }),
        payments: {
          createRefund: vi.fn(async ({ paymentIntentId, chargeId }: any) => {
            if (paymentIntentId === "pi_force_error") {
              throw new Error("stripe error: already refunded");
            }
            return {
              id: "re_test_123",
              status: "succeeded",
              amount: 999,
              payment_intent: paymentIntentId || null,
              charge: chargeId || null,
            };
          }),
        },
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        logActivity: vi.fn(),
      },
      queries,
    };
  };

  it("rejects when neither paymentIntentId nor chargeId is provided", async () => {
    const { ctx } = baseCtx();
    const handler = loadHandler(mountPost, ctx);
    const res = mockRes();
    await handler(
      { user: { uid: "admin-1" }, body: { reason: "some reason" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "missing_stripe_id" });
  });

  it("rejects when reason is missing or too short", async () => {
    const { ctx } = baseCtx();
    const handler = loadHandler(mountPost, ctx);

    const res1 = mockRes();
    await handler(
      { user: { uid: "admin-1" }, body: { paymentIntentId: "pi_x" } },
      res1,
    );
    expect(res1.status).toHaveBeenCalledWith(400);
    expect(res1.json).toHaveBeenCalledWith({ error: "reason_required" });

    const res2 = mockRes();
    await handler(
      {
        user: { uid: "admin-1" },
        body: { paymentIntentId: "pi_x", reason: "xy" },
      },
      res2,
    );
    expect(res2.status).toHaveBeenCalledWith(400);
    expect(res2.json).toHaveBeenCalledWith({ error: "reason_required" });
  });

  it("issues the refund, records an audit row, returns the refund id", async () => {
    const { ctx, queries } = baseCtx();
    const handler = loadHandler(mountPost, ctx);
    const res = mockRes();
    await handler(
      {
        user: { uid: "admin-1" },
        body: { paymentIntentId: "pi_test_1", reason: "charged in error" },
      },
      res,
    );
    expect(ctx.payments.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: "pi_test_1",
        metadata: expect.objectContaining({ admin_uid: "admin-1" }),
      }),
    );
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      refundId: "re_test_123",
    });

    const insert = queries.find((c) =>
      String(c[0]).includes("INSERT INTO admin_refunds"),
    );
    expect(insert, "audit row insert was not made").toBeTruthy();
    expect(String(insert![0])).toMatch(/status.*success|'success'/);
  });

  it("records an error row and returns 502 when Stripe rejects", async () => {
    const { ctx, queries } = baseCtx();
    const handler = loadHandler(mountPost, ctx);
    const res = mockRes();
    await handler(
      {
        user: { uid: "admin-1" },
        body: {
          paymentIntentId: "pi_force_error",
          reason: "test failure path",
        },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(502);
    const insert = queries.find((c) =>
      String(c[0]).includes("INSERT INTO admin_refunds"),
    );
    expect(insert, "error audit row was not written").toBeTruthy();
    // Error inserts pass null for stripe_refund_id (refund never created)
    // and stamp status='error' + the Stripe error text.
    expect(insert![1]).toContain("test failure path");
  });
});

describe("GET /api/admin/refunds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the last 50 admin_refunds rows newest-first", async () => {
    const rows = [
      { id: 3, reason: "newest", status: "success", admin_uid: "a-1" },
      { id: 2, reason: "middle", status: "success", admin_uid: "a-1" },
      { id: 1, reason: "oldest", status: "error", admin_uid: "a-1" },
    ];
    const mysqlQuery = vi.fn().mockResolvedValue(rows);
    const ctx: any = {
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery,
    };
    const handler = loadHandler(mountGet, ctx, "get");
    const res = mockRes();
    await handler({ user: { uid: "admin-1" } }, res);
    expect(res.json).toHaveBeenCalledWith({ items: rows });
    expect(mysqlQuery).toHaveBeenCalled();
    expect(String(mysqlQuery.mock.calls[0][0])).toMatch(
      /SELECT[\s\S]+FROM admin_refunds[\s\S]+ORDER BY id DESC[\s\S]+LIMIT 50/i,
    );
  });
});
