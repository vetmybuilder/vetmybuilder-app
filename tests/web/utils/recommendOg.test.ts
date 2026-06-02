// tests/web/utils/recommendOg.test.ts
//
// Pins the per-project Open Graph title/description used when a recommend
// link is shared to Facebook / Nextdoor. Falls back gracefully when the
// project can't be resolved server-side.

import { describe, it, expect } from "vitest";
import { buildRecommendOg } from "../../../web/utils/recommendOg";

describe("buildRecommendOg", () => {
  it("tailors title + description to the project", () => {
    const og = buildRecommendOg({
      name: "External Wall Insulation in E4 (Semi-Detached)",
      location: "E4",
    });
    expect(og.title).toBe(
      "Recommend a tradesperson · External Wall Insulation in E4 (Semi-Detached)",
    );
    expect(og.description).toContain("E4");
    expect(og.description).toContain(
      "External Wall Insulation in E4 (Semi-Detached)",
    );
  });

  it("falls back gracefully when name is missing", () => {
    const og = buildRecommendOg({});
    expect(og.title).toBe("Recommend a tradesperson · VetMyBuilder");
    expect(og.description.length).toBeGreaterThan(0);
  });
});
