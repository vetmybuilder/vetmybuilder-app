import { describe, it, expect } from "vitest";
const {
  TIERS,
  getTier,
  isValidTier,
} = require("../../../server/lib/subscriptions/tiers.js");

describe("subscription tiers", () => {
  it("exports the three tiers with correct pence amounts", () => {
    expect(getTier("week_1")).toMatchObject({
      id: "week_1",
      amountPence: 399,
      interval: "week",
      intervalCount: 1,
    });
    expect(getTier("week_2")).toMatchObject({
      id: "week_2",
      amountPence: 699,
      interval: "week",
      intervalCount: 2,
    });
    expect(getTier("month_1")).toMatchObject({
      id: "month_1",
      amountPence: 999,
      interval: "month",
      intervalCount: 1,
    });
  });

  it("isValidTier returns true for known ids and false for unknown", () => {
    expect(isValidTier("week_1")).toBe(true);
    expect(isValidTier("month_1")).toBe(true);
    expect(isValidTier("year_1")).toBe(false);
    expect(isValidTier("")).toBe(false);
    expect(isValidTier(null)).toBe(false);
    expect(isValidTier(undefined)).toBe(false);
  });

  it("getTier returns null for unknown tier", () => {
    expect(getTier("year_1")).toBeNull();
    expect(getTier("")).toBeNull();
  });

  it("TIERS is a frozen object", () => {
    expect(Object.isFrozen(TIERS)).toBe(true);
  });
});
