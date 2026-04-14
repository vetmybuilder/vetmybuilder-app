import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JOB_FIELDS } = require("../../server/lib/jobFields.js") as {
  JOB_FIELDS: Array<{
    id: string;
    priceModel?: (
      a: unknown,
      c?: { workType?: string | null },
    ) => { min: number; max: number } | null;
  }>;
};

const insulationSpec = JOB_FIELDS.find((s) => s.id === "insulation")!;
const priceModel = insulationSpec.priceModel!;

function answers(area: number | null) {
  return {
    _version: 1,
    insulation: area == null ? {} : { area_m2: area },
  };
}

describe("insulation priceModel", () => {
  describe("input handling", () => {
    it("returns null when answers is null", () => {
      expect(priceModel(null, { workType: "Loft Insulation" })).toBeNull();
    });

    it("returns null when insulation group is missing", () => {
      expect(
        priceModel({ _version: 1 }, { workType: "Loft Insulation" }),
      ).toBeNull();
    });

    it("returns null when area_m2 is missing, zero, or negative", () => {
      const ctx = { workType: "Loft Insulation" };
      expect(priceModel(answers(null), ctx)).toBeNull();
      expect(priceModel(answers(0), ctx)).toBeNull();
      expect(priceModel(answers(-5), ctx)).toBeNull();
    });

    it("returns null when no context/workType is supplied", () => {
      expect(priceModel(answers(50))).toBeNull();
      expect(priceModel(answers(50), {})).toBeNull();
    });

    it("returns null for ambiguous work types (Garage / Bedroom Upgrade)", () => {
      expect(
        priceModel(answers(40), { workType: "Garage Insulation" }),
      ).toBeNull();
      expect(
        priceModel(answers(40), { workType: "Bedroom Insulation Upgrade" }),
      ).toBeNull();
    });
  });

  describe("work-type → rate mapping", () => {
    it("prices cavity wall cheapest and external wall most expensive", () => {
      const cavity = priceModel(answers(50), {
        workType: "Cavity Wall Insulation",
      })!;
      const ewi = priceModel(answers(50), {
        workType: "External Wall Insulation",
      })!;

      expect(cavity.max).toBeLessThan(ewi.min);
    });

    it("treats Roof / Room-in-Roof / Loft Insulation the same (all map to 'loft')", () => {
      const loft = priceModel(answers(40), { workType: "Loft Insulation" })!;
      const roof = priceModel(answers(40), { workType: "Roof Insulation" })!;
      const roomInRoof = priceModel(answers(40), {
        workType: "Room-in-Roof Insulation",
      })!;
      expect(loft).toEqual(roof);
      expect(loft).toEqual(roomInRoof);
    });

    it("treats Floor Insulation and Underfloor Insulation as equivalent", () => {
      const floor = priceModel(answers(30), {
        workType: "Floor Insulation",
      })!;
      const under = priceModel(answers(30), {
        workType: "Underfloor Insulation",
      })!;
      expect(floor).toEqual(under);
    });
  });

  describe("rounding & shape", () => {
    it("returns values rounded to £50", () => {
      const r = priceModel(answers(37), { workType: "Loft Insulation" })!;
      expect(r.min % 50).toBe(0);
      expect(r.max % 50).toBe(0);
    });

    it("returns min <= max", () => {
      const r = priceModel(answers(50), {
        workType: "Cavity Wall Insulation",
      })!;
      expect(r.min).toBeLessThanOrEqual(r.max);
    });
  });
});
