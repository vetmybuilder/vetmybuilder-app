import { describe, it, expect } from "vitest";
const { rankBuilders } = require("../../../server/lib/matching/rankBuilders.js");

describe("rankBuilders", () => {
  const project = {
    id: 1,
    classification: {
      type: "kitchen",
      recommended_trades: ["kitchen_fitter", "plumber"],
      price_band_estimate: "5000-10000",
    },
    outward: "E4",
  };

  it("returns empty array when no candidates", () => {
    const result = rankBuilders({ project, candidates: [] });
    expect(result).toEqual([]);
  });

  it("scores a perfect trade + area + price match above a partial match", () => {
    const perfect = {
      uid: "b1",
      primaryTrade: "kitchen_fitter",
      secondaryTrades: ["plumber"],
      serviceAreas: ["E4", "E10"],
      priceBand: "5000-10000",
      baseScore: 60,
    };
    const partial = {
      uid: "b2",
      primaryTrade: "plumber",
      secondaryTrades: [],
      serviceAreas: ["SW1A"],
      priceBand: "under-1000",
      baseScore: 60,
    };
    const ranked = rankBuilders({ project, candidates: [partial, perfect] });
    expect(ranked[0].uid).toBe("b1");
    expect(ranked[1].uid).toBe("b2");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("excludes candidates with no trade or area overlap", () => {
    const noMatch = {
      uid: "bX",
      primaryTrade: "electrician",
      secondaryTrades: [],
      serviceAreas: ["M1"],
      priceBand: "under-1000",
      baseScore: 99,
    };
    const result = rankBuilders({ project, candidates: [noMatch] });
    expect(result).toEqual([]);
  });

  it("applies tier label from candidate input", () => {
    const recommended = {
      uid: "b1",
      primaryTrade: "kitchen_fitter",
      serviceAreas: ["E4"],
      baseScore: 40,
      tier: "recommended",
    };
    const subscribed = {
      uid: "b2",
      primaryTrade: "kitchen_fitter",
      serviceAreas: ["E4"],
      baseScore: 80,
      tier: "subscribed",
    };
    const result = rankBuilders({
      project,
      candidates: [subscribed, recommended],
    });
    const [first, second] = result;
    expect(first.tier).toBe("recommended");
    expect(second.tier).toBe("subscribed");
  });
});
