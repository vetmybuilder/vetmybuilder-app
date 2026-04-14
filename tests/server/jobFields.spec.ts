import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  getSpecForSelection,
  validateAnswers,
} = require("../../server/lib/jobFields.js") as {
  getSpecForSelection: (types?: string[] | null) => { id: string } | null;
  validateAnswers: (
    answers: unknown,
  ) => { ok: true } | { ok: false; errors: Array<{ path: string; message: string }> };
};

describe("jobFields.getSpecForSelection", () => {
  it("returns the flooring spec for a Flooring-category work type", () => {
    expect(getSpecForSelection(["Carpet Fitting"])?.id).toBe("flooring");
  });

  it("returns the flooring spec for a cross-category flooring work type", () => {
    // Bathroom Flooring lives in the Bathroom category but does flooring work.
    expect(getSpecForSelection(["Bathroom Flooring"])?.id).toBe("flooring");
    expect(getSpecForSelection(["Kitchen Flooring"])?.id).toBe("flooring");
  });

  it("returns null for a non-flooring work type", () => {
    expect(getSpecForSelection(["Tumble Dryer Installation"])).toBeNull();
    expect(getSpecForSelection(["Wet Room Installation"])).toBeNull();
  });

  it("returns the spec when any selected type matches", () => {
    expect(
      getSpecForSelection(["Unknown Work", "Bathroom Flooring"])?.id,
    ).toBe("flooring");
  });

  it("returns null for empty / null / undefined input", () => {
    expect(getSpecForSelection([])).toBeNull();
    expect(getSpecForSelection(null)).toBeNull();
    expect(getSpecForSelection(undefined)).toBeNull();
  });
});

describe("jobFields.validateAnswers", () => {
  it("accepts null / undefined (answers are optional)", () => {
    expect(validateAnswers(null)).toEqual({ ok: true });
    expect(validateAnswers(undefined)).toEqual({ ok: true });
  });

  it("rejects non-object values", () => {
    const r = validateAnswers("oops");
    expect(r.ok).toBe(false);
  });

  it("accepts a fully-valid flooring answers object", () => {
    expect(
      validateAnswers({
        _version: 1,
        flooring: {
          size: { kind: "m2", value: 42 },
          floor_type: "engineered_wood",
          removal_required: true,
          subfloor_condition: "needs_levelling",
        },
      }),
    ).toEqual({ ok: true });
  });

  it("accepts a minimal flooring object (only required fields)", () => {
    expect(
      validateAnswers({
        _version: 1,
        flooring: {
          size: { kind: "rooms", value: 2 },
          floor_type: "carpet",
        },
      }),
    ).toEqual({ ok: true });
  });

  it("reports required size missing", () => {
    const r = validateAnswers({
      flooring: { floor_type: "carpet" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].path).toBe("flooring.size");
    }
  });

  it("reports invalid select option", () => {
    const r = validateAnswers({
      flooring: {
        size: { kind: "m2", value: 10 },
        floor_type: "bogus_value",
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].path).toBe("flooring.floor_type");
      expect(r.errors[0].message).toMatch(/must be one of/);
    }
  });

  it("reports invalid boolean type", () => {
    const r = validateAnswers({
      flooring: {
        size: { kind: "rooms", value: 2 },
        floor_type: "carpet",
        removal_required: "yes",
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].path).toBe("flooring.removal_required");
      expect(r.errors[0].message).toMatch(/boolean/);
    }
  });

  it("accepts unknown groups for forward compatibility", () => {
    expect(
      validateAnswers({ _version: 1, unknown_group: { foo: "bar" } }),
    ).toEqual({ ok: true });
  });
});
