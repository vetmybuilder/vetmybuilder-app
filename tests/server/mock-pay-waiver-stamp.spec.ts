import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
}));

const mount = require("../../server/routes/payments/mock.pay.post.js");
const {
  REFUND_POLICY_VERSION,
} = require("../../server/lib/payments/refundPolicyVersion");

function loadHandler(ctx: any) {
  let captured: any = null;
  const router: any = {
    post: (...args: any[]) => {
      captured = args[args.length - 1];
    },
  };
  mount(router, ctx);
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// Mock-mode runs in dev + E2E and bypasses the Stripe webhook handler,
// so the waiver stamp has to be applied here too - otherwise local +
// staging unlocks (or any mock-pay activation) lose audit coverage even
// though the user ticked the box at checkout.
describe("POST /api/payments/mock/pay - stamps waiver columns on activation", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeCtx(sessionMetadata: Record<string, string>) {
    const queries: any[] = [];
    return {
      queries,
      ctx: {
        auth: (_q: any, _r: any, n: any) => n(),
        mysqlQuery: vi.fn(async (...args: any[]) => {
          queries.push(args);
          return { insertId: 1 };
        }),
        payments: {
          getSession: vi.fn(async () => ({
            id: "sess_mock_1",
            userId: "u-buyer-1",
            metadata: sessionMetadata,
            items: [{ price: { amount: 999, currency: "GBP" }, quantity: 1 }],
          })),
          markPaid: vi.fn(async () => undefined),
        },
      },
    };
  }

  it("project_contact_unlocks gets waiver_accepted_at + REFUND_POLICY_VERSION", async () => {
    const { ctx, queries } = makeCtx({
      type: "unlock_contact",
      projectId: "42",
    });
    const handler = loadHandler(ctx);
    const res = mockRes();
    await handler(
      {
        user: { uid: "u-buyer-1" },
        body: { sessionId: "sess_mock_1" },
        params: {},
        query: {},
      },
      res,
    );

    const insert = queries.find((c) =>
      String(c[0]).includes("INSERT INTO project_contact_unlocks"),
    );
    expect(insert, "unlock insert was not made").toBeTruthy();
    expect(String(insert![0])).toMatch(/waiver_accepted_at/);
    expect(String(insert![0])).toMatch(/waiver_policy_version/);
    expect(insert![1]).toContain(REFUND_POLICY_VERSION);
  });

  it("payments_subscription gets waiver_accepted_at + REFUND_POLICY_VERSION", async () => {
    const { ctx, queries } = makeCtx({
      type: "subscription",
      planId: "gold",
    });
    const handler = loadHandler(ctx);
    const res = mockRes();
    await handler(
      {
        user: { uid: "u-buyer-1" },
        body: { sessionId: "sess_mock_1" },
        params: {},
        query: {},
      },
      res,
    );

    const insert = queries.find((c) =>
      String(c[0]).includes("INSERT INTO payments_subscription"),
    );
    expect(insert, "subscription insert was not made").toBeTruthy();
    expect(String(insert![0])).toMatch(/waiver_accepted_at/);
    expect(String(insert![0])).toMatch(/waiver_policy_version/);
    expect(insert![1]).toContain(REFUND_POLICY_VERSION);
  });
});
