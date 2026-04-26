import { describe, it, expect, vi } from "vitest";
import {
  matchAndNotifyTradesman,
  normaliseCompanyName,
} from "../../server/lib/matchRecommendationToTradesman";

vi.mock("../../server/lib/ai/enrichNotificationMessage", () => ({
  enrichMessage: async (opts: any) => opts.templateMessage,
}));

vi.mock("../../server/lib/pushSender", () => ({
  sendPushToUser: () => {},
}));

type Call = { sql: string; params: any[] };

function makeFakeQuery(initialRows: Record<string, any[]> = {}) {
  const calls: Call[] = [];
  const tradesmen = initialRows.tradesmen ?? [];
  const existingNotifications = initialRows.notifications ?? [];

  const fn = vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });

    if (/FROM\s+tradesmen/i.test(sql)) return tradesmen;
    if (/FROM\s+notifications/i.test(sql)) return existingNotifications;
    if (/UPDATE\s+recommendations/i.test(sql)) return { affectedRows: 1 };
    if (/INSERT\s+INTO\s+notifications/i.test(sql)) return { insertId: 1 };
    return [];
  });

  return { fn, calls };
}

describe("matchAndNotifyTradesman — link recommendation to tradesman", () => {
  it("writes linked_tradesman_uid when company matches an active tradesman", async () => {
    const { fn, calls } = makeFakeQuery({
      tradesmen: [
        { user_id: "uid-london-bath", company_name: "London Bathroom Co Ltd" },
      ],
    });

    await matchAndNotifyTradesman({
      mysqlQuery: fn,
      companyName: "London Bathroom Co",
      projectId: 42,
      recommendationId: 99,
    });

    const updateCall = calls.find((c) => /UPDATE\s+recommendations/i.test(c.sql));
    expect(updateCall, "expected UPDATE recommendations call").toBeDefined();
    expect(updateCall!.params).toEqual(["uid-london-bath", 99]);
    expect(updateCall!.sql).toMatch(/linked_tradesman_uid\s+IS\s+NULL/i);
  });

  it("does not link when no tradesman matches", async () => {
    const { fn, calls } = makeFakeQuery({
      tradesmen: [
        { user_id: "uid-other", company_name: "Some Other Builder Ltd" },
      ],
    });

    await matchAndNotifyTradesman({
      mysqlQuery: fn,
      companyName: "bbc",
      projectId: 1,
      recommendationId: 80,
    });

    const updateCall = calls.find((c) => /UPDATE\s+recommendations/i.test(c.sql));
    expect(updateCall).toBeUndefined();
  });

  it("does not attempt the UPDATE when recommendationId is missing", async () => {
    const { fn, calls } = makeFakeQuery({
      tradesmen: [
        { user_id: "uid-london-bath", company_name: "London Bathroom Co Ltd" },
      ],
    });

    await matchAndNotifyTradesman({
      mysqlQuery: fn,
      companyName: "London Bathroom Co",
      projectId: 42,
    });

    const updateCall = calls.find((c) => /UPDATE\s+recommendations/i.test(c.sql));
    expect(updateCall).toBeUndefined();
  });
});

describe("normaliseCompanyName", () => {
  it("strips suffixes and punctuation", () => {
    expect(normaliseCompanyName("London Bathroom Co Ltd")).toBe(
      normaliseCompanyName("London Bathroom Co"),
    );
    expect(normaliseCompanyName("ACME Plumbing, Inc.")).toBe(
      normaliseCompanyName("acme plumbing"),
    );
  });
});
