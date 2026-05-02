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
    // Two queries fire now: (1) the standard 14-day homeowner-initiated
    // expiry and (2) the paid-unlock boost-expiry pass. Mock both with
    // distinct affectedRows so we can assert the totals are summed.
    const q = vi
      .fn()
      .mockResolvedValueOnce({ affectedRows: 3 })
      .mockResolvedValueOnce({ affectedRows: 1 });
    const updated = await expireSwipeInterests(q);
    expect(updated).toBe(4);

    // First call: standard 14-day expiry, parameterised by EXPIRY_DAYS.
    const [sql1, params1] = q.mock.calls[0];
    expect(sql1).toMatch(/UPDATE swipe_interest/i);
    expect(sql1).toMatch(/status\s*=\s*'expired'/i);
    expect(sql1).toMatch(/status\s*=\s*'pending'/i);
    expect(params1).toEqual([14]);

    // Second call: paid-unlock boost expiry, no parameters - filters by
    // boost_expires_at < NOW() literal in the SQL.
    const [sql2] = q.mock.calls[1];
    expect(sql2).toMatch(/UPDATE swipe_interest/i);
    expect(sql2).toMatch(/source\s*=\s*'paid_unlock'/i);
    expect(sql2).toMatch(/boost_expires_at/i);
  });

  it("returns 0 on query error (fails safe)", async () => {
    const q = vi.fn().mockRejectedValue(new Error("db down"));
    const updated = await expireSwipeInterests(q);
    expect(updated).toBe(0);
  });
});
