import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

const { claimPipelineEntry } = require("../../server/lib/claimPipelineEntry.js");

function mockQuery(data: Record<string, any[]> = {}) {
  const calls: { sql: string; params: any[] }[] = [];
  const fn = vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
    calls.push({ sql, params: params || [] });
    if (/WHERE company_number.*claimed_by IS NULL/.test(sql)) return data.byNumber || [];
    if (/WHERE claimed_by IS NULL AND status/.test(sql)) return data.unclaimed || [];
    if (/UPDATE tradesperson_pipeline/.test(sql)) return [];
    if (/SELECT id, company, projectId FROM recommendations/.test(sql)) return data.pipelineRecs || [];
    if (/UPDATE recommendations/.test(sql)) return [];
    if (/SELECT ownerUserId/.test(sql)) return data.project || [{ ownerUserId: "owner-1" }];
    if (/INSERT INTO notifications/.test(sql)) return [];
    return [];
  });
  return { fn, calls };
}

describe("claimPipelineEntry", () => {
  it("claims pipeline entry by company number", async () => {
    const { fn, calls } = mockQuery({
      byNumber: [{ id: 7, company_name: "Acme Plumbing Ltd" }],
      pipelineRecs: [],
    });

    await claimPipelineEntry({
      mysqlQuery: fn, uid: "uid-123", companyName: "Acme Plumbing Ltd", companyNumber: "12345678",
    });

    const claimCall = calls.find((c) => c.sql.includes("UPDATE tradesperson_pipeline"));
    expect(claimCall).toBeDefined();
    expect(claimCall!.params).toContain("uid-123");
  });

  it("claims by normalised name when no company number", async () => {
    const { fn, calls } = mockQuery({
      unclaimed: [{ id: 9, company_name: "Acme Plumbing Ltd" }],
      pipelineRecs: [],
    });

    await claimPipelineEntry({
      mysqlQuery: fn, uid: "uid-456", companyName: "Acme Plumbing", companyNumber: null,
    });

    const claimCall = calls.find((c) => c.sql.includes("UPDATE tradesperson_pipeline"));
    expect(claimCall).toBeDefined();
    expect(claimCall!.params).toContain("uid-456");
  });

  it("changes source from pipeline to community_match on claim", async () => {
    const { fn, calls } = mockQuery({
      byNumber: [{ id: 3, company_name: "Bob Builder Ltd" }],
      pipelineRecs: [
        { id: 101, company: "Bob Builder Ltd", projectId: 1 },
      ],
    });

    await claimPipelineEntry({
      mysqlQuery: fn, uid: "uid-789", companyName: "Bob Builder Ltd", companyNumber: "99999999",
    });

    const recUpdate = calls.find((c) => c.sql.includes("UPDATE recommendations"));
    expect(recUpdate).toBeDefined();
    expect(recUpdate!.sql).toContain("community_match");
    expect(recUpdate!.params).toContain("uid-789");
  });

  it("notifies the homeowner when recs move to community_match", async () => {
    const broadcast = vi.fn();
    const { fn, calls } = mockQuery({
      byNumber: [{ id: 3, company_name: "Bob Builder Ltd" }],
      pipelineRecs: [
        { id: 101, company: "Bob Builder Ltd", projectId: 1 },
      ],
    });

    await claimPipelineEntry({
      mysqlQuery: fn, uid: "uid-789", companyName: "Bob Builder Ltd", companyNumber: "99999999",
      broadcastNotification: broadcast,
    });

    const notifCall = calls.find((c) => c.sql.includes("INSERT INTO notifications"));
    expect(notifCall).toBeDefined();
    expect(notifCall!.params[1]).toContain("claimed their profile");
    expect(broadcast).toHaveBeenCalledWith("owner-1", expect.objectContaining({ type: "recommendation_new" }));
  });

  it("notifies once per project even with multiple recs", async () => {
    const broadcast = vi.fn();
    const { fn, calls } = mockQuery({
      byNumber: [{ id: 3, company_name: "Bob Builder Ltd" }],
      pipelineRecs: [
        { id: 101, company: "Bob Builder Ltd", projectId: 1 },
        { id: 102, company: "Bob Builder Ltd", projectId: 1 },
      ],
    });

    await claimPipelineEntry({
      mysqlQuery: fn, uid: "uid-789", companyName: "Bob Builder Ltd", companyNumber: "99999999",
      broadcastNotification: broadcast,
    });

    const notifCalls = calls.filter((c) => c.sql.includes("INSERT INTO notifications"));
    expect(notifCalls).toHaveLength(1);
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it("does not query unclaimed by name if company number matched", async () => {
    const { fn, calls } = mockQuery({
      byNumber: [{ id: 7, company_name: "Acme Ltd" }],
      pipelineRecs: [],
    });

    await claimPipelineEntry({
      mysqlQuery: fn, uid: "uid-123", companyName: "Acme Ltd", companyNumber: "12345678",
    });

    const unclaimedQuery = calls.find((c) => c.sql.includes("claimed_by IS NULL AND status"));
    expect(unclaimedQuery).toBeUndefined();
  });

  it("does nothing when company name is empty", async () => {
    const { fn } = mockQuery();
    await claimPipelineEntry({ mysqlQuery: fn, uid: "uid-000", companyName: "", companyNumber: null });
    expect(fn).not.toHaveBeenCalled();
  });

  it("does nothing when no match exists", async () => {
    const { fn, calls } = mockQuery({ unclaimed: [] });
    await claimPipelineEntry({ mysqlQuery: fn, uid: "uid-111", companyName: "Unknown", companyNumber: null });
    const claimCall = calls.find((c) => c.sql.includes("UPDATE tradesperson_pipeline"));
    expect(claimCall).toBeUndefined();
  });

  it("never throws on DB error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("DB down"));
    await expect(
      claimPipelineEntry({ mysqlQuery: fn, uid: "uid-222", companyName: "Any", companyNumber: null }),
    ).resolves.toBeUndefined();
  });
});
