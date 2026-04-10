import { describe, it, expect } from "vitest";

const { scoreMatch } = require("../../server/lib/ai/jobMatcher.js");

describe("scoreMatch", () => {
  it("returns 60 trade points for a full recommended_trades match", () => {
    const result = scoreMatch({
      tradesmanTrades: ["Plumber", "Bathroom Fitter"],
      tradesmanAreas: [],
      projectType: "Bathroom",
      projectLocation: "",
      recommendedTrades: ["Bathroom Fitter", "Tiler"],
      projectCreatedAt: new Date(),
    });
    expect(result.trade).toBe(60);
  });

  it("returns 30 trade points for a partial type-only match", () => {
    const result = scoreMatch({
      tradesmanTrades: ["Plumber"],
      tradesmanAreas: [],
      projectType: "Plumbing",
      projectLocation: "",
      recommendedTrades: ["Electrician"],
      projectCreatedAt: new Date(),
    });
    expect(result.trade).toBe(30);
  });

  it("returns 0 trade points when nothing matches", () => {
    const result = scoreMatch({
      tradesmanTrades: ["Roofer"],
      tradesmanAreas: [],
      projectType: "Bathroom",
      projectLocation: "",
      recommendedTrades: ["Plumber", "Tiler"],
      projectCreatedAt: new Date(),
    });
    expect(result.trade).toBe(0);
  });

  it("returns 30 location points for exact area match", () => {
    const result = scoreMatch({
      tradesmanTrades: [],
      tradesmanAreas: ["E4", "N17"],
      projectType: "",
      projectLocation: "E4",
      recommendedTrades: [],
      projectCreatedAt: new Date(),
    });
    expect(result.location).toBe(30);
  });

  it("returns 15 location points for same-letter area match", () => {
    const result = scoreMatch({
      tradesmanTrades: [],
      tradesmanAreas: ["E17"],
      projectType: "",
      projectLocation: "E4",
      recommendedTrades: [],
      projectCreatedAt: new Date(),
    });
    expect(result.location).toBe(15);
  });

  it("returns 0 location points for no area match", () => {
    const result = scoreMatch({
      tradesmanTrades: [],
      tradesmanAreas: ["N17", "N1"],
      projectType: "",
      projectLocation: "SW1A",
      recommendedTrades: [],
      projectCreatedAt: new Date(),
    });
    expect(result.location).toBe(0);
  });

  it("returns 10 recency points for a project posted in the last 24h", () => {
    const result = scoreMatch({
      tradesmanTrades: [],
      tradesmanAreas: [],
      projectType: "",
      projectLocation: "",
      recommendedTrades: [],
      projectCreatedAt: new Date(),
    });
    expect(result.recency).toBe(10);
  });

  it("returns 5 recency points for a project posted 2 days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const result = scoreMatch({
      tradesmanTrades: [],
      tradesmanAreas: [],
      projectType: "",
      projectLocation: "",
      recommendedTrades: [],
      projectCreatedAt: twoDaysAgo,
    });
    expect(result.recency).toBe(5);
  });

  it("returns 0 recency points for a project posted 5 days ago", () => {
    const fiveDaysAgo = new Date(Date.now() - 120 * 60 * 60 * 1000);
    const result = scoreMatch({
      tradesmanTrades: [],
      tradesmanAreas: [],
      projectType: "",
      projectLocation: "",
      recommendedTrades: [],
      projectCreatedAt: fiveDaysAgo,
    });
    expect(result.recency).toBe(0);
  });

  it("returns correct total for a perfect match", () => {
    const result = scoreMatch({
      tradesmanTrades: ["Plumber"],
      tradesmanAreas: ["E4"],
      projectType: "Plumbing",
      projectLocation: "E4",
      recommendedTrades: ["Plumber"],
      projectCreatedAt: new Date(),
    });
    expect(result.total).toBe(100); // 60 + 30 + 10
  });

  it("is case-insensitive for trades and areas", () => {
    const result = scoreMatch({
      tradesmanTrades: ["plumber"],
      tradesmanAreas: ["e4"],
      projectType: "",
      projectLocation: "E4",
      recommendedTrades: ["Plumber"],
      projectCreatedAt: new Date(),
    });
    expect(result.trade).toBe(60);
    expect(result.location).toBe(30);
  });
});
