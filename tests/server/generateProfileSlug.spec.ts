import { describe, it, expect } from "vitest";

const { generateSlug } = require("../../server/lib/generateProfileSlug");

describe("generateSlug", () => {
  it("slugifies company name", () => {
    expect(generateSlug("Elegant Building Services")).toBe("elegant-building-services");
  });

  it("strips special characters", () => {
    expect(generateSlug("Bob's Windows & Doors Ltd")).toBe("bobs-windows-doors-ltd");
  });

  it("collapses multiple hyphens", () => {
    expect(generateSlug("A  &  B  Construction")).toBe("a-b-construction");
  });

  it("trims leading/trailing hyphens", () => {
    expect(generateSlug("  --Test Co--  ")).toBe("test-co");
  });

  it("falls back to fallback when name is empty", () => {
    expect(generateSlug("", "chris.morris.k7f2x")).toBe("chris.morris.k7f2x");
  });

  it("returns null when both are empty", () => {
    expect(generateSlug("", "")).toBeNull();
  });
});
