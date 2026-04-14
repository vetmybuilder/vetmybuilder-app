import { describe, it, expect } from "vitest";

import { computeProjectPriceRange } from "../../../web/utils/projectPricing";

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
});

describe("computeProjectPriceRange — insulation (requires context.workType)", () => {
  it("returns a range for Loft Insulation with area", () => {
    const range = computeProjectPriceRange("Loft Insulation", {
      _version: 1,
      insulation: { area_m2: 40 },
    });
    expect(range).not.toBeNull();
    expect(range!.min).toBeLessThanOrEqual(range!.max);
  });

  it("returns null for an ambiguous insulation work type", () => {
    // Garage Insulation is one of the spec's workTypes but has no
    // deterministic rate mapping — computeProjectPriceRange should return
    // null so the AI's fallback estimate keeps rendering.
    expect(
      computeProjectPriceRange("Garage Insulation", {
        _version: 1,
        insulation: { area_m2: 40 },
      }),
    ).toBeNull();
  });
});

