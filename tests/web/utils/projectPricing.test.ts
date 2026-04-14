import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock — each test sets the flag it needs.
vi.mock("../../../web/utils/featureFlags", () => ({
  isProjectPriceRangeEnabled: vi.fn(() => true),
}));

import {
  computeProjectPriceRange,
  hasVisiblePriceRange,
} from "../../../web/utils/projectPricing";
import { isProjectPriceRangeEnabled } from "../../../web/utils/featureFlags";

const flooringAnswers = {
  _version: 1,
  flooring: {
    size: { kind: "m2" as const, value: 50 },
    floor_type: "carpet" as const,
  },
};

describe("computeProjectPriceRange", () => {
  it("returns a range when work type matches a spec and answers are valid", () => {
    const range = computeProjectPriceRange("Carpet Fitting", flooringAnswers);
    expect(range).not.toBeNull();
    expect(range!.min).toBeLessThanOrEqual(range!.max);
  });

  it("returns null for a work type outside any spec", () => {
    expect(
      computeProjectPriceRange("Tumble Dryer Installation", flooringAnswers),
    ).toBeNull();
  });

  it("returns null when workType is missing", () => {
    expect(computeProjectPriceRange(null, flooringAnswers)).toBeNull();
    expect(computeProjectPriceRange(undefined, flooringAnswers)).toBeNull();
  });

  it("returns null when answers are missing", () => {
    expect(computeProjectPriceRange("Carpet Fitting", null)).toBeNull();
    expect(computeProjectPriceRange("Carpet Fitting", undefined)).toBeNull();
  });

  it("accepts a JSON string for answers", () => {
    const range = computeProjectPriceRange(
      "Carpet Fitting",
      JSON.stringify(flooringAnswers),
    );
    expect(range).not.toBeNull();
  });

  it("returns null when required answers are missing (priceModel returns null)", () => {
    expect(
      computeProjectPriceRange("Carpet Fitting", {
        _version: 1,
        flooring: { floor_type: "carpet" },
      }),
    ).toBeNull();
  });

  // The flag MUST NOT gate computeProjectPriceRange — that's the whole
  // reason hasVisiblePriceRange exists as a separate predicate.
  it("does NOT gate on the feature flag", () => {
    (isProjectPriceRangeEnabled as any).mockReturnValue(false);
    const range = computeProjectPriceRange("Carpet Fitting", flooringAnswers);
    expect(range).not.toBeNull();
  });
});

describe("hasVisiblePriceRange", () => {
  beforeEach(() => {
    (isProjectPriceRangeEnabled as any).mockReturnValue(true);
  });

  it("is true when flag is on and a range is computable", () => {
    expect(hasVisiblePriceRange("Carpet Fitting", flooringAnswers)).toBe(true);
  });

  it("is false when the feature flag is off", () => {
    (isProjectPriceRangeEnabled as any).mockReturnValue(false);
    expect(hasVisiblePriceRange("Carpet Fitting", flooringAnswers)).toBe(false);
  });

  it("is false for a non-spec work type", () => {
    expect(
      hasVisiblePriceRange("Tumble Dryer Installation", flooringAnswers),
    ).toBe(false);
  });

  it("is false when answers don't produce a range", () => {
    expect(
      hasVisiblePriceRange("Carpet Fitting", {
        _version: 1,
        flooring: { floor_type: "carpet" },
      }),
    ).toBe(false);
  });
});
