import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JOB_FIELDS } = require("../../server/lib/jobFields.js") as {
  JOB_FIELDS: Array<{
    id: string;
    priceModel?: (a: unknown) => { min: number; max: number } | null;
  }>;
};

const flooringSpec = JOB_FIELDS.find((s) => s.id === "flooring")!;
const priceModel = flooringSpec.priceModel!;

/** Valid-by-default flooring answers — tests override just the fields they care about. */
function answers(overrides: Partial<{
  size: { kind: "m2" | "rooms"; value: number };
  floor_type: string;
  removal_required: boolean;
  subfloor_condition: string;
}> = {}) {
  return {
    _version: 1,
    flooring: {
      size: { kind: "m2", value: 50 },
      floor_type: "carpet",
      ...overrides,
    },
  };
}

describe("flooring priceModel", () => {
  describe("input handling", () => {
    it("returns null when answers is null or missing flooring block", () => {
      expect(priceModel(null)).toBeNull();
      expect(priceModel({ _version: 1 })).toBeNull();
    });

    it("returns null when size is missing", () => {
      expect(priceModel({ flooring: { floor_type: "carpet" } })).toBeNull();
    });

    it("returns null when size value is not a positive number", () => {
      expect(
        priceModel(answers({ size: { kind: "m2", value: 0 } })),
      ).toBeNull();
      expect(
        priceModel(answers({ size: { kind: "m2", value: -10 } })),
      ).toBeNull();
      expect(
        priceModel(answers({ size: { kind: "m2", value: NaN as any } })),
      ).toBeNull();
    });

    it("returns null for an unknown floor_type", () => {
      expect(
        priceModel(answers({ floor_type: "bogus_material" })),
      ).toBeNull();
    });
  });

  describe("area conversion", () => {
    it("uses m² directly when size.kind is m2", () => {
      const r = priceModel(
        answers({
          size: { kind: "m2", value: 50 },
          floor_type: "carpet",
        }),
      )!;
      // 50 m² × carpet (labour 8-12 + material 10-30) = min 900, max 2100,
      // rounded down/up to 50 = 900 / 2100.
      expect(r.min).toBe(900);
      expect(r.max).toBe(2100);
    });

    it("multiplies rooms × 16 m² average when size.kind is rooms", () => {
      const r = priceModel(
        answers({
          size: { kind: "rooms", value: 2 },
          floor_type: "carpet",
        }),
      )!;
      // 2 × 16 = 32 m²; 32 × (18, 42) = 576, 1344 → rounded 550, 1350
      expect(r.min).toBe(550);
      expect(r.max).toBe(1350);
    });
  });

  describe("floor_type rates", () => {
    it("prices cheapest for carpet and most expensive for solid_wood", () => {
      const carpet = priceModel(
        answers({ floor_type: "carpet" }),
      )!;
      const solid = priceModel(
        answers({ floor_type: "solid_wood" }),
      )!;
      expect(solid.min).toBeGreaterThan(carpet.min);
      expect(solid.max).toBeGreaterThan(carpet.max);
    });
  });

  describe("surcharges", () => {
    it("increases the range when removal is required", () => {
      const base = priceModel(
        answers({ removal_required: false }),
      )!;
      const withRemoval = priceModel(
        answers({ removal_required: true }),
      )!;
      expect(withRemoval.min).toBeGreaterThan(base.min);
      expect(withRemoval.max).toBeGreaterThan(base.max);
    });

    it("increases the range further when subfloor needs levelling", () => {
      const withRemoval = priceModel(
        answers({
          removal_required: true,
          subfloor_condition: "level",
        }),
      )!;
      const withLevelling = priceModel(
        answers({
          removal_required: true,
          subfloor_condition: "needs_levelling",
        }),
      )!;
      expect(withLevelling.min).toBeGreaterThan(withRemoval.min);
      expect(withLevelling.max).toBeGreaterThan(withRemoval.max);
    });

    it("does not apply a levelling surcharge when subfloor is 'level' or 'unknown'", () => {
      const levelAnswer = priceModel(
        answers({
          removal_required: true,
          subfloor_condition: "level",
        }),
      )!;
      const unknownAnswer = priceModel(
        answers({
          removal_required: true,
          subfloor_condition: "unknown",
        }),
      )!;
      expect(levelAnswer).toEqual(unknownAnswer);
    });
  });

  describe("rounding & shape", () => {
    it("returns values rounded to the nearest £50", () => {
      const r = priceModel(
        answers({
          size: { kind: "m2", value: 37 },
          floor_type: "laminate",
        }),
      )!;
      expect(r.min % 50).toBe(0);
      expect(r.max % 50).toBe(0);
    });

    it("always returns min <= max", () => {
      const r = priceModel(answers())!;
      expect(r.min).toBeLessThanOrEqual(r.max);
    });
  });
});
