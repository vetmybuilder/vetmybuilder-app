import { describe, it, expect, vi } from "vitest";
const {
  expireSwipeInterests,
  EXPIRY_DAYS,
} = require("../../../server/lib/matching/expireSwipeInterests.js");

describe("expireSwipeInterests", () => {
  it("exports the expiry window as 14 days", () => {
    expect(EXPIRY_DAYS).toBe(14);
  });

  it("runs an UPDATE that transitions stale pending rows to expired", async () => {
    const q = vi.fn().mockResolvedValue({ affectedRows: 3 });
    const updated = await expireSwipeInterests(q);
    expect(updated).toBe(3);
    const [sql, params] = q.mock.calls[0];
    expect(sql).toMatch(/UPDATE swipe_interest/i);
    expect(sql).toMatch(/status\s*=\s*'expired'/i);
    expect(sql).toMatch(/status\s*=\s*'pending'/i);
    expect(params).toEqual([14]);
  });

  it("returns 0 on query error (fails safe)", async () => {
    const q = vi.fn().mockRejectedValue(new Error("db down"));
    const updated = await expireSwipeInterests(q);
    expect(updated).toBe(0);
  });
});
