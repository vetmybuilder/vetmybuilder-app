import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  summariseBuilderRecommendations,
  CLASSIFIER_VERSION,
  FEATURE,
} from "../../server/lib/ai/recommendationSummariser.js";

// Get the CJS module that the summariser calls at runtime.
// vi.spyOn on this object intercepts llmClient.complete() calls.
const llmClient = require("../../server/lib/ai/llmClient");

describe("recommendationSummariser", () => {
  let mysqlQuery: ReturnType<typeof vi.fn>;
  let mockComplete: ReturnType<typeof vi.fn>;
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  beforeEach(() => {
    mysqlQuery = vi.fn().mockResolvedValue({ insertId: 1 });
    mockComplete = vi
      .spyOn(llmClient, "complete")
      .mockResolvedValue({
        text: "{}",
        mode: "stub",
        costPence: 0,
        latencyMs: 0,
      });
  });

  it("generates a 3-bullet summary and upserts into builder_summaries", async () => {
    const bullets = [
      "Consistently praised for punctuality and reliability.",
      "High quality finishes on kitchen and bathroom projects.",
      "Clear communication throughout the build process.",
    ];
    mockComplete.mockResolvedValue({
      text: JSON.stringify({ bullets }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const result = await summariseBuilderRecommendations({
      mysqlQuery,
      company: "Acme Builders Ltd",
      comments: [
        "They were always on time and did a great job on our kitchen.",
        "Excellent communication, kept us informed at every stage.",
        "Really reliable team, high quality bathroom renovation.",
      ],
      recommendationIds: [10, 20, 30],
      log,
    });

    expect(result).toEqual({ bullets });

    // Verify upsert was called
    expect(mysqlQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO builder_summaries"),
      expect.arrayContaining([
        "Acme Builders Ltd",
        JSON.stringify(bullets),
        3,
        JSON.stringify([10, 20, 30]),
        CLASSIFIER_VERSION,
      ]),
    );
  });

  it("returns null when the LLM response cannot be parsed as JSON", async () => {
    mockComplete.mockResolvedValue({
      text: "This is not valid JSON at all, just gibberish text.",
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const result = await summariseBuilderRecommendations({
      mysqlQuery,
      company: "Acme Builders Ltd",
      comments: ["Great work."],
      recommendationIds: [10],
      log,
    });

    expect(result).toBeNull();
    // No DB call when parsing fails
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("returns null when bullets array has wrong length", async () => {
    mockComplete.mockResolvedValue({
      text: JSON.stringify({ bullets: ["one"] }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const result = await summariseBuilderRecommendations({
      mysqlQuery,
      company: "Acme Builders Ltd",
      comments: ["Great work."],
      recommendationIds: [10],
      log,
    });

    expect(result).toBeNull();
    // No DB call when validation fails
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("exports the expected constants", () => {
    expect(CLASSIFIER_VERSION).toBe("rec-summariser-v1");
    expect(FEATURE).toBe("rec_summary");
  });
});
