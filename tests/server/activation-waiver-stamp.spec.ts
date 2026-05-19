import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// syncSubscriptionCache hits the DB at the end of the subscription
// handler. We don't care about its internals here - stub it out so the
// test stays focused on the INSERT we own.
vi.mock(
  "../../server/lib/subscriptions/syncSubscriptionCache",
  () => ({ syncSubscriptionCache: vi.fn().mockResolvedValue(undefined) }),
);

const { activateUnlock } = require("../../server/lib/payments/handlers/activateUnlock");
const {
  subscriptionCheckoutCompleted,
} = require("../../server/lib/payments/handlers/subscriptionCheckoutCompleted");
const {
  REFUND_POLICY_VERSION,
} = require("../../server/lib/payments/refundPolicyVersion");

function findCall(queries: any[], needle: string) {
  return queries.find((c) => String(c[0]).includes(needle));
}

describe("activation handlers - stamp waiver columns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("activateUnlock writes waiver_policy_version into project_contact_unlocks", async () => {
    const queries: any[] = [];
    const mysqlQuery = vi.fn(async (...args: any[]) => {
      queries.push(args);
      // The handler does several selects/inserts. Return empty/zero for
      // anything it tries to read so it short-circuits the chat-thread
      // side-effects we don't care about here.
      const sql = String(args[0]);
      if (sql.startsWith("SELECT ownerUserId FROM projects")) return [];
      if (sql.startsWith("SELECT id FROM swipe_interest")) return [{ id: 0 }];
      return { insertId: 1 };
    });

    const ctx: any = {
      mysqlQuery,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      logActivity: vi.fn(),
    };

    const event = {
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          mode: "payment",
          amount_total: 999,
          currency: "gbp",
          payment_intent: "pi_test_1",
          metadata: {
            type: "unlock_contact",
            buyerUid: "u-buyer-1",
            projectId: "42",
          },
        },
      },
    };

    await activateUnlock({ event, ctx });

    const unlockInsert = findCall(queries, "INSERT INTO project_contact_unlocks");
    expect(unlockInsert, "unlock insert query was not made").toBeTruthy();
    expect(unlockInsert![0]).toMatch(/waiver_accepted_at/);
    expect(unlockInsert![0]).toMatch(/waiver_policy_version/);
    expect(unlockInsert![1]).toContain(REFUND_POLICY_VERSION);
  });

  it("subscriptionCheckoutCompleted writes waiver_policy_version into builder_subscriptions", async () => {
    const queries: any[] = [];
    const mysqlQuery = vi.fn(async (...args: any[]) => {
      queries.push(args);
      return { insertId: 1 };
    });

    const ctx: any = {
      mysqlQuery,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    const event = {
      id: "evt_sub_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_sub_1",
          mode: "subscription",
          subscription: "sub_test_1",
          metadata: {
            userId: "u-trade-1",
            tier: "month_1",
          },
        },
      },
    };

    await subscriptionCheckoutCompleted({ event, ctx });

    const subInsert = findCall(queries, "INSERT INTO builder_subscriptions");
    expect(subInsert, "subscription insert query was not made").toBeTruthy();
    expect(subInsert![0]).toMatch(/waiver_accepted_at/);
    expect(subInsert![0]).toMatch(/waiver_policy_version/);
    expect(subInsert![1]).toContain(REFUND_POLICY_VERSION);
  });
});
