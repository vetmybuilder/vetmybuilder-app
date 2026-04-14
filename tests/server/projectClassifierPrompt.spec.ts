import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { _internal } = require("../../server/lib/ai/projectClassifier.js") as {
  _internal: {
    buildUserPrompt: (args: {
      description: string;
      type?: string | null;
      location?: string | null;
      propertyType?: string | null;
      bedrooms?: number | null;
      answers?: Record<string, any> | null;
    }) => string;
    flattenAnswersForPrompt: (
      answers: Record<string, any>,
    ) => string[];
  };
};

const { buildUserPrompt, flattenAnswersForPrompt } = _internal;

// ──────────────────────────────────────────────────────────────────
// flattenAnswersForPrompt — the pure reducer that turns the nested
// answers object into bullet-point strings for the LLM.
// ──────────────────────────────────────────────────────────────────

describe("flattenAnswersForPrompt", () => {
  it("renders an 'either' field as `<value> <kind>`", () => {
    const out = flattenAnswersForPrompt({
      flooring: { size: { kind: "m2", value: 55 } },
    });
    expect(out).toEqual(["flooring.size: 55 m2"]);
  });

  it("renders booleans as yes/no", () => {
    const out = flattenAnswersForPrompt({
      flooring: { removal_required: true, another_flag: false },
    });
    expect(out).toContain("flooring.removal_required: yes");
    expect(out).toContain("flooring.another_flag: no");
  });

  it("renders strings and numbers verbatim", () => {
    const out = flattenAnswersForPrompt({
      flooring: { floor_type: "engineered_wood", count: 3 },
    });
    expect(out).toContain("flooring.floor_type: engineered_wood");
    expect(out).toContain("flooring.count: 3");
  });

  it("ignores _version and skips null/undefined/empty values", () => {
    const out = flattenAnswersForPrompt({
      _version: 1,
      flooring: {
        floor_type: "carpet",
        missing: null,
        absent: undefined,
        blank: "",
      },
    });
    // Only floor_type should survive
    expect(out).toEqual(["flooring.floor_type: carpet"]);
  });

  it("returns an empty array for an empty answers object", () => {
    expect(flattenAnswersForPrompt({})).toEqual([]);
    expect(flattenAnswersForPrompt({ _version: 1 })).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────
// buildUserPrompt — assembles the full classifier prompt. Critical
// behaviour: the "Structured homeowner answers:" block must appear
// when answers are present, and must be absent otherwise.
// ──────────────────────────────────────────────────────────────────

describe("buildUserPrompt", () => {
  const baseInput = {
    description: "Refit kitchen and install new appliances.",
    type: "Carpet Fitting",
    location: "E4",
    propertyType: "Semi-Detached",
    bedrooms: 3,
  };

  it("includes the structured-answers block when answers are provided", () => {
    const prompt = buildUserPrompt({
      ...baseInput,
      answers: {
        _version: 1,
        flooring: {
          size: { kind: "m2", value: 55 },
          floor_type: "engineered_wood",
          removal_required: true,
          subfloor_condition: "needs_levelling",
        },
      },
    });

    expect(prompt).toContain("Structured homeowner answers:");
    expect(prompt).toContain("- flooring.size: 55 m2");
    expect(prompt).toContain("- flooring.floor_type: engineered_wood");
    expect(prompt).toContain("- flooring.removal_required: yes");
    expect(prompt).toContain("- flooring.subfloor_condition: needs_levelling");
  });

  it("omits the structured-answers block when answers are absent", () => {
    const prompt = buildUserPrompt({ ...baseInput, answers: undefined });
    expect(prompt).not.toContain("Structured homeowner answers:");
  });

  it("omits the structured-answers block when answers are null", () => {
    const prompt = buildUserPrompt({ ...baseInput, answers: null });
    expect(prompt).not.toContain("Structured homeowner answers:");
  });

  it("omits the structured-answers block when the object has no meaningful entries", () => {
    const prompt = buildUserPrompt({
      ...baseInput,
      answers: { _version: 1 },
    });
    expect(prompt).not.toContain("Structured homeowner answers:");
  });

  it("places the structured-answers block before the free-text description", () => {
    const prompt = buildUserPrompt({
      ...baseInput,
      description: "UNIQUE-DESCRIPTION-MARKER",
      answers: {
        _version: 1,
        flooring: { floor_type: "carpet" },
      },
    });

    const answersIdx = prompt.indexOf("Structured homeowner answers:");
    const descIdx = prompt.indexOf("UNIQUE-DESCRIPTION-MARKER");

    expect(answersIdx).toBeGreaterThan(-1);
    expect(descIdx).toBeGreaterThan(answersIdx);
  });

  it("still includes form-field context lines alongside structured answers", () => {
    const prompt = buildUserPrompt({
      ...baseInput,
      answers: {
        _version: 1,
        flooring: { floor_type: "carpet" },
      },
    });

    expect(prompt).toContain("Form-selected type: Carpet Fitting");
    expect(prompt).toContain("Property type: Semi-Detached");
    expect(prompt).toContain("Bedrooms: 3");
    expect(prompt).toContain("Location: E4");
  });
});
