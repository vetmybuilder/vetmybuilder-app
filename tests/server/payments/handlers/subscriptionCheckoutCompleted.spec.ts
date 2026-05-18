import { describe, it, expect, vi } from "vitest";
import { subscriptionCheckoutCompleted } from "../../../../server/lib/payments/handlers/subscriptionCheckoutCompleted";

vi.mock("../../../../server/lib/subscriptions/syncSubscriptionCache", () => ({
  syncSubscriptionCache: vi.fn().mockResolvedValue(undefined),
}));

describe("subscriptionCheckoutCompleted handler", () => {
  it("inserts/updates builder_subscriptions row when mode=subscription", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const ctx: any = { mysqlQuery, log: console };
    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: "sub_test_1",
          metadata: { userId: "uid_1", tier: "week_1" },
        },
      },
    };
    await subscriptionCheckoutCompleted({ event, ctx });
    const calls = mysqlQuery.mock.calls.map((c) => c[0]);
    expect(calls.some((q) => q.includes("builder_subscriptions"))).toBe(true);
  });

  it("no-ops when mode != subscription", async () => {
    const mysqlQuery = vi.fn();
    const ctx: any = { mysqlQuery, log: console };
    const event = {
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", metadata: {} } },
    };
    await subscriptionCheckoutCompleted({ event, ctx });
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("no-ops when userId/tier/subscription is missing", async () => {
    const mysqlQuery = vi.fn();
    const ctx: any = { mysqlQuery, log: console };
    const event = {
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", metadata: {} } },
    };
    await subscriptionCheckoutCompleted({ event, ctx });
    expect(mysqlQuery).not.toHaveBeenCalled();
  });
});
