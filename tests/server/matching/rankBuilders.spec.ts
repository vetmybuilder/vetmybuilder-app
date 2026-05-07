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
    // Both trade and area match (eligible), but only via secondary trade
    // and without a price-band hit, so it ranks below the perfect
    // candidate.
    const partial = {
      uid: "b2",
      primaryTrade: "general_builder",
      secondaryTrades: ["plumber"],
      serviceAreas: ["E4"],
      priceBand: "under-1000",
      baseScore: 60,
    };
    const ranked = rankBuilders({ project, candidates: [partial, perfect] });
    expect(ranked[0].uid).toBe("b1");
    expect(ranked[1].uid).toBe("b2");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("excludes candidates with no trade overlap (right area, wrong trade)", () => {
    // The Elegant-in-Pest-Control case: trade in the right area but doesn't
    // do the work. Strict AND semantics on trade + area means they must
    // not appear.
    const wrongTrade = {
      uid: "bX",
      primaryTrade: "electrician",
      secondaryTrades: [],
      serviceAreas: ["E4"],
      priceBand: "under-1000",
      baseScore: 99,
    };
    const result = rankBuilders({ project, candidates: [wrongTrade] });
    expect(result).toEqual([]);
  });

  it("excludes candidates with no area overlap (right trade, wrong area)", () => {
    const wrongArea = {
      uid: "bY",
      primaryTrade: "kitchen_fitter",
      secondaryTrades: [],
      serviceAreas: ["M1"],
      priceBand: "under-1000",
      baseScore: 99,
    };
    const result = rankBuilders({ project, candidates: [wrongArea] });
    expect(result).toEqual([]);
  });

  it("cold start: surfaces all candidates when project has no classification", () => {
    // A freshly-posted project might not have an AI classification yet
    // (recommended_trades empty). The deck must still populate so the
    // homeowner has someone to swipe on - relax to "service-anywhere"
    // matching behaviour. Once classification arrives, refinement kicks in.
    const coldStart = {
      id: 99,
      classification: {},
      outward: "E4",
    };
    const candidate = {
      uid: "bColdStart",
      primaryTrade: "electrician",
      secondaryTrades: [],
      serviceAreas: ["E4"],
      priceBand: null,
      baseScore: 50,
    };
    const result = rankBuilders({
      project: coldStart,
      candidates: [candidate],
    });
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("bColdStart");
  });

  it("cold start: surfaces a service-anywhere trade (empty serviceAreas) when project has classification but trade hasn't set areas", () => {
    const candidate = {
      uid: "bAnywhere",
      primaryTrade: "kitchen_fitter",
      secondaryTrades: [],
      serviceAreas: [], // hasn't configured service areas yet
      priceBand: null,
      baseScore: 50,
    };
    const result = rankBuilders({ project, candidates: [candidate] });
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("bAnywhere");
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
