// Tests for projectTradeMap - the canonical project-type → trades
// mapping. These guard the two failure modes that silently kill matching:
//   1) A trade label in the map drifts from TRADE_TYPES.label (typo,
//      case change, dropped trade).
//   2) A project type in PROJECT_TYPES is missing a category entry, so
//      lookups return [] and the homeowner sees an empty deck.
import { describe, it, expect } from "vitest";
import { TRADE_TYPES } from "../../../web/types/tradeTypes";
import { PROJECT_TYPES } from "../../../web/types/projectTypes";

const {
  CATEGORY_TRADES,
  TYPE_TRADES,
  TYPE_TO_CATEGORY,
  getTradesForProjectType,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("../../../server/lib/matching/projectTradeMap.js");

describe("projectTradeMap", () => {
  const validTradeLabels = new Set(TRADE_TYPES.map((t) => t.label));

  it("every trade in CATEGORY_TRADES is a real TRADE_TYPES.label", () => {
    const drift: Array<{ category: string; trade: string }> = [];
    for (const [category, trades] of Object.entries(CATEGORY_TRADES)) {
      for (const trade of trades as string[]) {
        if (!validTradeLabels.has(trade)) {
          drift.push({ category, trade });
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it("every trade in TYPE_TRADES is a real TRADE_TYPES.label", () => {
    const drift: Array<{ type: string; trade: string }> = [];
    for (const [type, trades] of Object.entries(TYPE_TRADES)) {
      for (const trade of trades as string[]) {
        if (!validTradeLabels.has(trade)) {
          drift.push({ type, trade });
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it("every PROJECT_TYPES entry has a category mapping", () => {
    const missing: string[] = [];
    for (const cat of PROJECT_TYPES) {
      for (const type of cat.types) {
        if (!TYPE_TO_CATEGORY[type]) missing.push(type);
      }
    }
    expect(missing).toEqual([]);
  });

  it("getTradesForProjectType: bathroom-category project returns bathroom-relevant trades", () => {
    const trades = getTradesForProjectType("Wet Room Installation");
    expect(trades).toContain("Bathroom Fitter");
    expect(trades).toContain("Plumber");
    expect(trades).toContain("Tiler");
  });

  it("getTradesForProjectType: per-type override beats category default", () => {
    // "Bathroom Tiling" overrides the broader Bathroom category (which
    // would include Plumber + Electrician) with just Tiler + Bathroom
    // Fitter - the only trades genuinely needed for tiling work.
    const trades = getTradesForProjectType("Bathroom Tiling");
    expect(trades).toEqual(["Tiler", "Bathroom Fitter"]);
  });

  it("getTradesForProjectType: fuzzy fallback when input isn't an exact catalog entry", () => {
    // "Wet Room Conversion" isn't in PROJECT_TYPES; the closest entry is
    // "Wet Room Installation" (Bathroom category). Token-overlap on
    // {wet, room} should pick it and return Bathroom trades.
    const trades = getTradesForProjectType("Wet Room Conversion");
    expect(trades).toContain("Bathroom Fitter");
    expect(trades).toContain("Plumber");
  });

  it("getTradesForProjectType: returns [] for nothing-like-it inputs", () => {
    expect(getTradesForProjectType("xyzqq nonsense made up")).toEqual([]);
    expect(getTradesForProjectType("")).toEqual([]);
    expect(getTradesForProjectType(null)).toEqual([]);
    expect(getTradesForProjectType(undefined)).toEqual([]);
  });
});
