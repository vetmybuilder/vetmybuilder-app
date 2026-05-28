// tests/server/assignProfileTemplate.spec.ts
import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assignTemplate, TEMPLATE_FAMILIES, VARIANT_COUNT } = require("../../server/lib/assignProfileTemplate");

describe("assignTemplate", () => {
  it("maps a known primary trade to its family", () => {
    const t = assignTemplate("Bathroom");
    expect(t.startsWith("bathroom-")).toBe(true);
  });

  it("uses the first trade as primary when multiple are listed", () => {
    const t = assignTemplate("Kitchen, Bathroom, Plumbing");
    expect(t.startsWith("kitchen-")).toBe(true);
  });

  it("falls back to 'general' for an unmapped trade", () => {
    const t = assignTemplate("Underwater Basket Weaving");
    expect(t.startsWith("general-")).toBe(true);
  });

  it("falls back to 'general' for empty input", () => {
    expect(assignTemplate("").startsWith("general-")).toBe(true);
    expect(assignTemplate(null).startsWith("general-")).toBe(true);
  });

  it("assigns a variant within the valid range", () => {
    for (let i = 0; i < 50; i++) {
      const variant = parseInt(assignTemplate("Roofing").split("-")[1], 10);
      expect(variant).toBeGreaterThanOrEqual(1);
      expect(variant).toBeLessThanOrEqual(VARIANT_COUNT);
    }
  });

  it("maps grouped families to the same template family", () => {
    expect(assignTemplate("Building & Construction").startsWith("extension-")).toBe(true);
    expect(assignTemplate("Heating & Cooling").startsWith("plumbing-")).toBe(true);
    expect(assignTemplate("Doors").startsWith("windows-")).toBe(true);
    expect(assignTemplate("Fencing & Gates").startsWith("landscaping-")).toBe(true);
  });

  it("exposes the family map and variant count", () => {
    expect(TEMPLATE_FAMILIES["Bathroom"]).toBe("bathroom");
    expect(VARIANT_COUNT).toBe(5);
  });
});
