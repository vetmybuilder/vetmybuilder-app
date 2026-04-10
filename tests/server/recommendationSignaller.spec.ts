import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger before requiring the module under test
vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Get the CJS module that the signaller calls at runtime.
// vi.spyOn on this object intercepts llmClient.complete() calls.
const llmClient = require("../../server/lib/ai/llmClient");

const {
  computeRecommendationSignals,
  CLASSIFIER_VERSION,
  FEATURE,
  STUB_RESPONSE,
} = require("../../server/lib/ai/recommendationSignaller.js");

describe("recommendationSignaller", () => {
  let mockComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockComplete = vi.spyOn(llmClient, "complete");
  });

  it("computes signals and upserts into recommendation_signals", async () => {
    mockComplete.mockResolvedValueOnce({
      text: JSON.stringify({
        sentiment: 0.85,
        generic_score: 0.25,
        themes: ["reliability", "communication"],
      }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/INSERT INTO recommendation_signals/.test(sql)) {
        inserted.push(params);
      }
      return [];
    });

    const result = await computeRecommendationSignals({
      mysqlQuery,
      recommendationId: 42,
      comment: "They were reliable and communicated well throughout the project.",
    });

    expect(result).not.toBeNull();
    expect(result.sentiment).toBe(0.85);
    expect(result.generic_score).toBe(0.25);
    expect(result.themes).toEqual(["reliability", "communication"]);
    expect(result.wordCount).toBe(9);
    expect(inserted).toHaveLength(1);

    const [recId, wordCount, genericScore, sentiment, themes, version] = inserted[0];
    expect(recId).toBe(42);
    expect(wordCount).toBe(9);
    expect(genericScore).toBe(0.25);
    expect(sentiment).toBe(0.85);
    expect(JSON.parse(themes)).toEqual(["reliability", "communication"]);
    expect(version).toBe(CLASSIFIER_VERSION);
  });

  it("returns null when JSON cannot be parsed", async () => {
    mockComplete.mockResolvedValueOnce({
      text: "not json",
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const mysqlQuery = vi.fn();
    const result = await computeRecommendationSignals({
      mysqlQuery,
      recommendationId: 1,
      comment: "Some comment text here for testing.",
    });

    expect(result).toBeNull();
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("returns null when sentiment is out of range", async () => {
    mockComplete.mockResolvedValueOnce({
      text: JSON.stringify({
        sentiment: 2.5,
        generic_score: 0.3,
        themes: ["quality"],
      }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const mysqlQuery = vi.fn();
    const result = await computeRecommendationSignals({
      mysqlQuery,
      recommendationId: 1,
      comment: "Some comment.",
    });

    expect(result).toBeNull();
  });

  it("returns null when generic_score is out of range", async () => {
    mockComplete.mockResolvedValueOnce({
      text: JSON.stringify({
        sentiment: 0.5,
        generic_score: -0.1,
        themes: ["quality"],
      }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const mysqlQuery = vi.fn();
    const result = await computeRecommendationSignals({
      mysqlQuery,
      recommendationId: 1,
      comment: "Some comment.",
    });

    expect(result).toBeNull();
  });

  it("returns null when themes is empty", async () => {
    mockComplete.mockResolvedValueOnce({
      text: JSON.stringify({
        sentiment: 0.5,
        generic_score: 0.3,
        themes: [],
      }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const mysqlQuery = vi.fn();
    const result = await computeRecommendationSignals({
      mysqlQuery,
      recommendationId: 1,
      comment: "Some comment.",
    });

    expect(result).toBeNull();
  });

  it("computes word_count locally without LLM", async () => {
    mockComplete.mockResolvedValueOnce({
      text: STUB_RESPONSE,
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/INSERT INTO/.test(sql)) inserted.push(params);
      return [];
    });

    await computeRecommendationSignals({
      mysqlQuery,
      recommendationId: 99,
      comment: "one two three four five",
    });

    expect(inserted[0][1]).toBe(5); // word_count = 5
  });

  it("exports the expected constants", () => {
    expect(CLASSIFIER_VERSION).toBe("rec-signaller-v1");
    expect(FEATURE).toBe("rec_signal");
  });
});
