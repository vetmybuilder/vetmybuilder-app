import { describe, it, expect, vi } from "vitest";
import { subscriptionUpdated } from "../../../../server/lib/payments/handlers/subscriptionUpdated";

vi.mock("../../../../server/lib/subscriptions/syncSubscriptionCache", () => ({
  syncSubscriptionCache: vi.fn().mockResolvedValue(undefined),
}));

describe("subscriptionUpdated handler", () => {
  it("UPDATEs builder_subscriptions with new status + period dates", async () => {
    const mysqlQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT user_id")) return [{ user_id: "uid_1" }];
      return [];
    });
    const ctx: any = { mysqlQuery, log: console };
    const event = {
      id: "evt_u_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_1",
          status: "active",
          current_period_start: 1700000000,
          current_period_end: 1700604800,
        },
      },
    };
    await subscriptionUpdated({ event, ctx });
    const updateCalls = mysqlQuery.mock.calls
      .map((c) => c[0])
      .filter((q: string) => q.startsWith("UPDATE builder_subscriptions"));
    expect(updateCalls.length).toBe(1);
  });

  it("skips syncSubscriptionCache when no user row matches the subscription id", async () => {
    const { syncSubscriptionCache } = await import(
      "../../../../server/lib/subscriptions/syncSubscriptionCache"
    );
    (syncSubscriptionCache as any).mockClear?.();
    const mysqlQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT user_id")) return [];
      return [];
    });
    const ctx: any = { mysqlQuery, log: console };
    const event = {
      id: "evt_u_orphan",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_orphan", status: "active" } },
    };
    await subscriptionUpdated({ event, ctx });
    expect(syncSubscriptionCache).not.toHaveBeenCalled();
  });

  it("passes null period dates through when current_period_start/end are absent", async () => {
    const mysqlQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT user_id")) return [{ user_id: "uid_1" }];
      return [];
    });
    const ctx: any = { mysqlQuery, log: console };
    const event = {
      id: "evt_u_no_period",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_test_1", status: "active" } },
    };
    await subscriptionUpdated({ event, ctx });
    const updateCall = mysqlQuery.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].startsWith("UPDATE builder_subscriptions"),
    );
    expect(updateCall).toBeDefined();
    // Second + third params are start/end. Both should be null when input is absent.
    expect(updateCall![1][1]).toBeNull();
    expect(updateCall![1][2]).toBeNull();
  });
});
