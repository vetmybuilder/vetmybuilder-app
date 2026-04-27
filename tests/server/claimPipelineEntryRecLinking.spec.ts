import { describe, it, expect, vi } from "vitest";
import { claimPipelineEntry } from "../../server/lib/claimPipelineEntry";

function makeFakeQuery(initial: Record<string, any[]> = {}) {
  const calls: { sql: string; params: any[] }[] = [];
  const pipelineRows = initial.pipeline ?? [];
  const unlinkedRecs = initial.unlinkedRecs ?? [];
  const projects = initial.projects ?? [];

  const fn = vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });

    if (/FROM\s+tradesperson_pipeline\s+WHERE\s+company_number/i.test(sql)) return [];
    if (/FROM\s+tradesperson_pipeline.*claimed_by\s+IS\s+NULL/i.test(sql)) return pipelineRows;
    if (/FROM\s+recommendations\s+WHERE\s+source\s*=\s*'pipeline'/i.test(sql)) return [];
    if (/FROM\s+recommendations\s+WHERE\s+linked_tradesman_uid\s+IS\s+NULL/i.test(sql)) return unlinkedRecs;
    if (/FROM\s+projects\s+WHERE\s+id/i.test(sql)) return projects;
    if (/UPDATE\s+recommendations/i.test(sql)) return { affectedRows: 1 };
    if (/UPDATE\s+tradesperson_pipeline/i.test(sql)) return { affectedRows: 1 };
    if (/INSERT\s+INTO\s+notifications/i.test(sql)) return { insertId: 1 };
    return [];
  });

  return { fn, calls };
}

describe("claimPipelineEntry — link unclaimed recommendations by company name", () => {
  it("links unclaimed recs whose normalised company name matches the new tradesman", async () => {
    const { fn, calls } = makeFakeQuery({
      pipeline: [],
      unlinkedRecs: [
        { id: 80, company: "Hudson & Sons Tiling Ltd", projectId: 3 },
        { id: 81, company: "Some Other Builder", projectId: 3 },
      ],
      projects: [{ ownerUserId: "owner-uid-1" }],
    });

    await claimPipelineEntry({
      mysqlQuery: fn,
      uid: "new-builder-uid",
      companyName: "Hudson & Sons Tiling",
    });

    const linkUpdate = calls.find(
      (c) => /UPDATE\s+recommendations.*linked_tradesman_uid/i.test(c.sql) && c.params.includes(80),
    );
    expect(linkUpdate, "rec 80 should be linked").toBeDefined();
    expect(linkUpdate!.params).toContain("new-builder-uid");

    const skippedUpdate = calls.find(
      (c) => /UPDATE\s+recommendations/i.test(c.sql) && c.params.includes(81),
    );
    expect(skippedUpdate, "rec 81 should NOT be linked").toBeUndefined();
  });

  it("inserts a homeowner notification per project, deduplicated", async () => {
    const { fn, calls } = makeFakeQuery({
      unlinkedRecs: [
        { id: 80, company: "Hudson Tiling", projectId: 3 },
        { id: 82, company: "Hudson Tiling", projectId: 3 },
      ],
      projects: [{ ownerUserId: "owner-1" }],
    });

    await claimPipelineEntry({
      mysqlQuery: fn,
      uid: "new-uid",
      companyName: "Hudson Tiling",
    });

    const notifInserts = calls.filter((c) =>
      /INSERT\s+INTO\s+notifications/i.test(c.sql),
    );
    expect(notifInserts).toHaveLength(1);
  });

  it("is a no-op when no unclaimed recs match", async () => {
    const { fn, calls } = makeFakeQuery({
      unlinkedRecs: [
        { id: 80, company: "Different Builder", projectId: 3 },
      ],
      projects: [],
    });

    await claimPipelineEntry({
      mysqlQuery: fn,
      uid: "new-uid",
      companyName: "Acme Plumbing",
    });

    const linkUpdate = calls.find((c) =>
      /UPDATE\s+recommendations.*linked_tradesman_uid/i.test(c.sql),
    );
    expect(linkUpdate).toBeUndefined();
  });
});
