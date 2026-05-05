import { describe, it, expect } from "vitest";
const { extractOutward } = require("../../../server/lib/matching/extractOutward.js");

describe("extractOutward", () => {
  it("returns null for empty / non-string input", () => {
    expect(extractOutward("")).toBeNull();
    expect(extractOutward(null as any)).toBeNull();
    expect(extractOutward(undefined as any)).toBeNull();
  });

  it("extracts the outward part from a full postcode", () => {
    expect(extractOutward("E4 7ER")).toBe("E4");
    expect(extractOutward("SW1A 1AA")).toBe("SW1A");
    expect(extractOutward("m1 1aa")).toBe("M1");
  });

  it("returns a bare outward code when there's no inward part", () => {
    expect(extractOutward("E4")).toBe("E4");
    expect(extractOutward("Chingford E4")).toBe("E4");
  });

  it("returns null when no postcode-looking token is present", () => {
    expect(extractOutward("Somewhere nice")).toBeNull();
  });
});
