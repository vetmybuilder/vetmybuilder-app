import { describe, it, expect, vi } from "vitest";
const { isBuilderSubscribed } = require("../../../server/lib/subscriptions/isBuilderSubscribed.js");

function fakeQuery(rows: any[]) {
  return vi.fn().mockResolvedValue(rows);
}

describe("isBuilderSubscribed", () => {
  it("returns false and skips the DB when user id is missing", async () => {
    const q = fakeQuery([]);
    expect(await isBuilderSubscribed("", q)).toBe(false);
    expect(await isBuilderSubscribed(null as any, q)).toBe(false);
    expect(q).not.toHaveBeenCalled();
  });

  it("returns true when the indexed query returns at least one row", async () => {
    const future = new Date(Date.now() + 86_400_000);
    const q = fakeQuery([
      { status: "active", current_period_end: future },
    ]);
    expect(await isBuilderSubscribed("uid-1", q)).toBe(true);
  });

  it("returns false when the indexed query returns no rows (canceled, expired, or missing)", async () => {
    const q = fakeQuery([]);
    expect(await isBuilderSubscribed("uid-1", q)).toBe(false);
  });

  it("returns false when the query throws", async () => {
    const q = vi.fn().mockRejectedValue(new Error("db down"));
    expect(await isBuilderSubscribed("uid-1", q)).toBe(false);
  });
});
