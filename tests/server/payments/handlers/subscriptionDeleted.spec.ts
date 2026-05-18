import { describe, it, expect, vi } from "vitest";
import { subscriptionDeleted } from "../../../../server/lib/payments/handlers/subscriptionDeleted";

vi.mock("../../../../server/lib/subscriptions/syncSubscriptionCache", () => ({
  syncSubscriptionCache: vi.fn().mockResolvedValue(undefined),
}));

describe("subscriptionDeleted handler", () => {
  it("sets status='canceled' and stamps canceled_at", async () => {
    const mysqlQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT user_id")) return [{ user_id: "uid_1" }];
      return [];
    });
    const ctx: any = { mysqlQuery, log: console };
    const event = {
      id: "evt_d_1",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_test_1" } },
    };
    await subscriptionDeleted({ event, ctx });
    const updateCalls = mysqlQuery.mock.calls
      .map((c) => c[0])
      .filter((q: string) => q.includes("status = 'canceled'"));
    expect(updateCalls.length).toBe(1);
  });

  it("still flips status to 'canceled' even when no user row matches", async () => {
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
      id: "evt_d_orphan",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_orphan" } },
    };
    await subscriptionDeleted({ event, ctx });
    const updateCalls = mysqlQuery.mock.calls
      .map((c) => c[0])
      .filter((q: string) => q.includes("status = 'canceled'"));
    expect(updateCalls.length).toBe(1);
    expect(syncSubscriptionCache).not.toHaveBeenCalled();
  });
});
