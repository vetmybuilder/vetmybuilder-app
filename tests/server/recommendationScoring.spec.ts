// tests/server/recommendationScoring.spec.ts
//
// Unit tests for the pure scoring function used by the recommendation /
// builder ranking system. Lives at server/lib/recommendationScoring.js so
// it can be unit tested without Express, MySQL, or Firebase.

import { describe, it, expect } from "vitest";
import {
  computeScore,
  ageInDays,
} from "../../server/lib/recommendationScoring";

// Score is rounded to 0.05, so use a tight tolerance for sanity checks.
const APPROX = 0.001;

describe("computeScore — baseline", () => {
  it("returns 0 for an empty input", () => {
    expect(computeScore({})).toBe(0);
  });

  it("returns 0 when called with no arguments at all", () => {
    expect(computeScore()).toBe(0);
  });
});

describe("computeScore — provenance (CHANGE 2)", () => {
  it("a friend recommendation contributes 0.5", () => {
    expect(computeScore({ fromFriend: 1 })).toBe(0.5);
  });

  it("a community recommendation contributes 0.25", () => {
    expect(computeScore({ fromCommunity: 1 })).toBe(0.25);
  });

  it("friend is now weighted higher than community", () => {
    const friend = computeScore({ fromFriend: 1 });
    const community = computeScore({ fromCommunity: 1 });
    expect(friend).toBeGreaterThan(community);
  });

  it("friend + community stack additively", () => {
    expect(computeScore({ fromFriend: 1, fromCommunity: 1 })).toBe(0.75);
  });
});

describe("computeScore — hires (CHANGE 3, the new term)", () => {
  it("zero hires contribute nothing", () => {
    expect(computeScore({ hiresAccepted: 0 })).toBe(0);
  });

  it("a single accepted hire contributes 1.2 (= log2(2) * 1.2)", () => {
    expect(computeScore({ hiresAccepted: 1 })).toBe(1.2);
  });

  it("3 accepted hires contribute 2.4 (= log2(4) * 1.2)", () => {
    expect(computeScore({ hiresAccepted: 3 })).toBe(2.4);
  });

  it("7 accepted hires contribute 3.6 (= log2(8) * 1.2)", () => {
    expect(computeScore({ hiresAccepted: 7 })).toBe(3.6);
  });

  it("15 accepted hires hits the cap at 4 * 1.2 = 4.8", () => {
    expect(computeScore({ hiresAccepted: 15 })).toBe(4.8);
  });

  it("50 accepted hires also caps at 4.8 (anti-gaming)", () => {
    expect(computeScore({ hiresAccepted: 50 })).toBe(4.8);
  });

  it("hires outweigh wins (1 hire > 1 win)", () => {
    const oneHire = computeScore({ hiresAccepted: 1 });
    const oneWin = computeScore({ wins: 1 });
    expect(oneHire).toBeGreaterThan(oneWin);
  });
});

describe("computeScore — wins (CHANGE 4: cap raised 4 → 5)", () => {
  it("8 wins still grows past the old cap", () => {
    // log2(9) ≈ 3.17, * 0.8 ≈ 2.54 → rounded to 2.55
    expect(computeScore({ wins: 8 })).toBeCloseTo(2.55, 1);
  });

  it("31 wins ≈ log2(32) = 5 → 4.0 (new cap)", () => {
    expect(computeScore({ wins: 31 })).toBe(4.0);
  });

  it("100 wins also caps at 4.0", () => {
    expect(computeScore({ wins: 100 })).toBe(4.0);
  });

  it("wins of 30 (new) exceeds wins of 30 under the old cap of 4", () => {
    // Sanity: under old cap of 4, wins=30 would have been 4 * 0.8 = 3.2.
    // Under new cap of 5: log2(31) ≈ 4.95 * 0.8 ≈ 3.96 → 3.95
    const score = computeScore({ wins: 30 });
    expect(score).toBeGreaterThan(3.2);
  });
});

describe("computeScore — likes (unchanged but worth pinning)", () => {
  it("1 like contributes 0.5 (= log2(2) * 0.5)", () => {
    expect(computeScore({ likes: 1 })).toBe(0.5);
  });

  it("15 likes hits the like cap at 4 * 0.5 = 2.0", () => {
    expect(computeScore({ likes: 15 })).toBe(2.0);
  });

  it("100 likes also caps at 2.0 (anti-farming)", () => {
    expect(computeScore({ likes: 100 })).toBe(2.0);
  });
});

describe("computeScore — acceptance-rate dampener (CHANGE 5)", () => {
  it("is NOT applied when totalHires < 3 (Bayesian threshold)", () => {
    // 2 accepted, 0 declined → 2 hires, below threshold → no dampening
    const undamped = computeScore({ hiresAccepted: 2, hiresDeclined: 0 });
    const expectedRaw = computeScore({ hiresAccepted: 2 });
    expect(undamped).toBe(expectedRaw);
  });

  it("is NOT applied for 1a / 1d (only 2 hires of data)", () => {
    const undamped = computeScore({ hiresAccepted: 1, hiresDeclined: 1 });
    const expectedRaw = computeScore({ hiresAccepted: 1 });
    expect(undamped).toBe(expectedRaw);
  });

  it("is applied at exactly 3 total hires (rate = 1.0 → no change)", () => {
    const score = computeScore({ hiresAccepted: 3, hiresDeclined: 0 });
    const expectedRaw = computeScore({ hiresAccepted: 3 });
    expect(score).toBe(expectedRaw);
  });

  it("a 50/50 rate dampens by exactly the floor (×0.5)", () => {
    const damped = computeScore({ hiresAccepted: 5, hiresDeclined: 5 });
    const undamped = computeScore({ hiresAccepted: 5 });
    // damped = round(undamped * 0.5 / 0.05) * 0.05
    expect(damped).toBeCloseTo(undamped * 0.5, 1);
  });

  it("a 1/9 rate clamps to the 0.5 floor (not 0.1)", () => {
    const damped = computeScore({ hiresAccepted: 1, hiresDeclined: 9 });
    const undamped = computeScore({ hiresAccepted: 1 });
    // floor protects: damped should be ~ undamped * 0.5, NOT * 0.1
    expect(damped).toBeCloseTo(undamped * 0.5, 1);
  });

  it("an 8/2 rate dampens by 0.8", () => {
    const damped = computeScore({ hiresAccepted: 8, hiresDeclined: 2 });
    const undamped = computeScore({ hiresAccepted: 8 });
    expect(damped).toBeCloseTo(undamped * 0.8, 1);
  });

  it("dampens the WHOLE score, not just the hires term", () => {
    // If only the hires term were dampened, this builder's wins/likes
    // would survive intact. We want the dampener to flag the entire
    // builder as suspicious.
    const damped = computeScore({
      wins: 10,
      likes: 10,
      hiresAccepted: 1,
      hiresDeclined: 9,
    });
    const undamped = computeScore({
      wins: 10,
      likes: 10,
      hiresAccepted: 1,
    });
    expect(damped).toBeLessThan(undamped);
    // Specifically, ~half (the floor)
    expect(damped).toBeCloseTo(undamped * 0.5, 1);
  });
});

describe("computeScore — recency decay (CHANGE 6)", () => {
  // Use a builder with a sizeable raw score to make decay observable
  const baseInputs = { wins: 10, likes: 10, hiresAccepted: 5 };

  it("a brand-new recommendation has no decay applied", () => {
    const fresh = computeScore({ ...baseInputs, ageDays: 0 });
    const noAge = computeScore(baseInputs);
    expect(fresh).toBe(noAge);
  });

  it("a 1-day-old recommendation is essentially undecayed", () => {
    const oneDay = computeScore({ ...baseInputs, ageDays: 1 });
    const noAge = computeScore(baseInputs);
    expect(oneDay).toBeCloseTo(noAge, 1);
  });

  it("an 18-month-old recommendation is exactly halved (half-life)", () => {
    const halfLife = computeScore({ ...baseInputs, ageDays: 18 * 30 });
    const noAge = computeScore(baseInputs);
    expect(halfLife).toBeCloseTo(noAge * 0.5, 1);
  });

  it("a 36-month-old recommendation is at quarter weight (two half-lives)", () => {
    const quarter = computeScore({ ...baseInputs, ageDays: 36 * 30 });
    const noAge = computeScore(baseInputs);
    expect(quarter).toBeCloseTo(noAge * 0.25, 1);
  });

  it("decay is monotonic (older = lower)", () => {
    const fresh = computeScore({ ...baseInputs, ageDays: 0 });
    const sixMo = computeScore({ ...baseInputs, ageDays: 6 * 30 });
    const eighteenMo = computeScore({ ...baseInputs, ageDays: 18 * 30 });
    const thirtySixMo = computeScore({ ...baseInputs, ageDays: 36 * 30 });

    expect(fresh).toBeGreaterThan(sixMo);
    expect(sixMo).toBeGreaterThan(eighteenMo);
    expect(eighteenMo).toBeGreaterThan(thirtySixMo);
  });

  it("a negative ageDays is treated as zero (not future-dated)", () => {
    expect(computeScore({ wins: 10, ageDays: -5 })).toBe(
      computeScore({ wins: 10 }),
    );
  });
});

describe("computeScore — Companies House", () => {
  it("verified status adds 0.6", () => {
    expect(computeScore({ ch: { status: "verified" } })).toBe(0.6);
  });

  it("ambiguous status adds 0.15", () => {
    expect(computeScore({ ch: { status: "ambiguous" } })).toBe(0.15);
  });

  it("no status string adds nothing", () => {
    expect(computeScore({ ch: {} })).toBe(0);
  });

  it("a chScore of 100 adds the cap of 0.5 on top of verified", () => {
    expect(computeScore({ ch: { status: "verified", score: 100 } })).toBe(1.1);
  });

  it("a chScore of 50 adds 0.25 on top of verified", () => {
    expect(computeScore({ ch: { status: "verified", score: 50 } })).toBe(0.85);
  });
});

describe("computeScore — combined realistic builders", () => {
  // These mirror the comparison table in the design doc. Each "builder"
  // is a whole-system scenario test.

  it("Builder A — Active recent star (fresh hires + friend rec + verified)", () => {
    const score = computeScore({
      fromFriend: 1,
      likes: 5,
      wins: 8,
      hiresAccepted: 6,
      hiresDeclined: 0,
      ageDays: 60, // ~2 months old
      ch: { status: "verified" },
    });
    // Should be the highest of the five scenarios.
    expect(score).toBeGreaterThan(5.5);
  });

  it("Builder B — Old reliable (heavy decay punishes age)", () => {
    const score = computeScore({
      likes: 12,
      wins: 20,
      hiresAccepted: 4,
      hiresDeclined: 1,
      ageDays: 30 * 30, // 30 months
      ch: { status: "verified" },
    });
    // 30 months → decay ~0.32. Strong raw signals but heavily aged out.
    expect(score).toBeLessThan(4);
  });

  it("Builder C — Like-farmed burner (no hires, no wins, just likes)", () => {
    const score = computeScore({
      likes: 50, // capped at 2.0
      ageDays: 30, // ~1 month
    });
    // No hires, no wins, no friend, no CH → roughly the like cap with mild decay
    expect(score).toBeLessThan(2.5);
  });

  it("Builder D — Decliner (good positives, but acceptance rate kills them)", () => {
    const dampened = computeScore({
      fromFriend: 1,
      likes: 3,
      wins: 5,
      hiresAccepted: 2,
      hiresDeclined: 8,
      ageDays: 4 * 30, // 4 months
      ch: { status: "verified" },
    });
    const sameWithoutDeclines = computeScore({
      fromFriend: 1,
      likes: 3,
      wins: 5,
      hiresAccepted: 2,
      hiresDeclined: 0,
      ageDays: 4 * 30,
      ch: { status: "verified" },
    });
    // Acceptance rate 2/10 = 0.2 → floored to 0.5 → roughly half
    expect(dampened).toBeLessThan(sameWithoutDeclines);
    expect(dampened).toBeCloseTo(sameWithoutDeclines * 0.5, 1);
  });

  it("Builder E — Brand new with no data (graceful zero-state)", () => {
    const score = computeScore({
      fromFriend: 1,
      likes: 1,
      ageDays: 0.5, // half a day
      ch: { status: "verified" },
    });
    // Should be a low but non-zero score based on the friend bonus + CH alone
    expect(score).toBeGreaterThan(1);
    expect(score).toBeLessThan(3);
  });
});

describe("computeScore — output shape", () => {
  it("rounds to nearest 0.05", () => {
    // Whatever the value is, multiplying by 20 should give an integer.
    const s = computeScore({
      fromFriend: 1,
      wins: 7,
      likes: 13,
      hiresAccepted: 4,
      ageDays: 100,
    });
    expect(Math.round(s * 20)).toBe(s * 20);
  });

  it("returns a finite number for arbitrary garbage-but-numeric inputs", () => {
    const s = computeScore({
      wins: 9999,
      likes: 9999,
      hiresAccepted: 9999,
      hiresDeclined: 9999,
      ageDays: 99999,
    });
    expect(Number.isFinite(s)).toBe(true);
  });
});

describe("ageInDays", () => {
  const FIXED_NOW = new Date("2026-04-07T12:00:00Z").getTime();

  it("returns 0 for null/undefined/empty", () => {
    expect(ageInDays(null, FIXED_NOW)).toBe(0);
    expect(ageInDays(undefined, FIXED_NOW)).toBe(0);
    expect(ageInDays("", FIXED_NOW)).toBe(0);
  });

  it("returns 0 for an unparseable date string", () => {
    expect(ageInDays("not-a-date", FIXED_NOW)).toBe(0);
  });

  it("returns 0 for a future date (clamps non-negative)", () => {
    const future = new Date(FIXED_NOW + 86_400_000).toISOString();
    expect(ageInDays(future, FIXED_NOW)).toBe(0);
  });

  it("returns ~1 for exactly 1 day ago", () => {
    const oneDayAgo = new Date(FIXED_NOW - 86_400_000).toISOString();
    expect(ageInDays(oneDayAgo, FIXED_NOW)).toBeCloseTo(1, 5);
  });

  it("returns ~30 for 30 days ago", () => {
    const thirtyDaysAgo = new Date(FIXED_NOW - 30 * 86_400_000).toISOString();
    expect(ageInDays(thirtyDaysAgo, FIXED_NOW)).toBeCloseTo(30, 5);
  });

  it("accepts a Date-like createdAt (number, ms timestamp)", () => {
    expect(ageInDays(FIXED_NOW - 86_400_000, FIXED_NOW)).toBeCloseTo(1, 5);
  });
});
