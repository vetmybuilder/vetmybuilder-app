import { describe, it, expect, vi } from "vitest";
import { activateUnlock } from "../../../../server/lib/payments/handlers/activateUnlock";

function makeEvent(overrides: any = {}) {
  return {
    id: "evt_test_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_abc",
        amount_total: 999,
        currency: "gbp",
        payment_intent: "pi_test_xyz",
        metadata: {
          type: "unlock_contact",
          buyerUid: "uid_buyer",
          projectId: "42",
          ...((overrides.metadata as any) || {}),
        },
        ...overrides,
      },
    },
  };
}

describe("activateUnlock handler", () => {
  it("inserts project_contact_unlocks and payments_oneoff rows with status 'active'", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const ctx: any = { mysqlQuery, log: console };
    await activateUnlock({ event: makeEvent(), ctx });
    const calls = mysqlQuery.mock.calls.map((c) => c[0]);
    expect(calls.some((q) => q.includes("project_contact_unlocks"))).toBe(true);
    expect(calls.some((q) => q.includes("payments_oneoff"))).toBe(true);
  });

  it("no-ops when metadata.type is not unlock_contact", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const ctx: any = { mysqlQuery, log: console };
    const event = makeEvent({ metadata: { type: "subscription" } });
    await activateUnlock({ event, ctx });
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("no-ops when buyerUid or projectId is missing", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const ctx: any = { mysqlQuery, log: console };
    const event = makeEvent({ metadata: { type: "unlock_contact" } });
    await activateUnlock({ event, ctx });
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("creates a swipe_interest row with source='paid_unlock' after the unlock activates", async () => {
    const mysqlQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM projects")) return [{ ownerUserId: "uid_owner" }];
      return { insertId: 7 };
    });
    const ctx: any = { mysqlQuery, log: console, broadcastNotification: vi.fn() };
    await activateUnlock({ event: makeEvent(), ctx });
    const calls = mysqlQuery.mock.calls.map((c) => c[0]);
    expect(calls.some((q) => q.includes("INTO swipe_interest"))).toBe(true);
  });
});
