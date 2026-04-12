import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// The classifier does `const llmClient = require("./llmClient")` then
// calls `llmClient.complete()`. vi.spyOn on the required module object
// intercepts this call.
const llmClient = require("../../server/lib/ai/llmClient");

const VALID_RESPONSE = {
  type: "Electrician",
  scope: "large",
  complexity: "complex",
  urgency: "months",
  recommended_trades: ["Electrician"],
  price_band_estimate: "£8,000-£15,000",
  materials: ["copper cable", "consumer unit"],
  key_concerns: ["EICR certificate"],
  summary: "Complete rewire of a 3-bed terraced house.",
};

describe("projectClassifier", () => {
  const silentLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let classifyProject: any;
  let mockComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockComplete = vi.spyOn(llmClient, "complete");
    mockComplete.mockReset();
    // Re-require after spy is set up
    classifyProject = require("../../server/lib/ai/projectClassifier.js").classifyProject;
  });

  it("classifies a project and inserts into project_classifications", async () => {
    mockComplete.mockResolvedValueOnce({
      text: JSON.stringify(VALID_RESPONSE),
      mode: "stub",
      costPence: 0.5,
      latencyMs: 120,
    });

    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/INSERT INTO project_classifications/.test(sql)) {
        inserted.push(params);
      }
      return [];
    });

    const result = await classifyProject({
      mysqlQuery,
      projectId: 1,
      description: "Full rewire of a 1930s terraced house",
      type: "Electrical",
      location: "E17",
      propertyType: "Terraced",
      bedrooms: 3,
      log: silentLog,
    });

    expect(result).toEqual(VALID_RESPONSE);
    expect(inserted).toHaveLength(1);
    expect(inserted[0][0]).toBe(1);
    expect(JSON.parse(inserted[0][3])).toEqual(VALID_RESPONSE);
  });

  it("returns null when mysqlQuery is missing", async () => {
    const result = await classifyProject({
      mysqlQuery: null,
      projectId: 1,
      description: "Some work",
      log: silentLog,
    });
    expect(result).toBeNull();
  });

  it("returns null when projectId is not a number", async () => {
    const result = await classifyProject({
      mysqlQuery: vi.fn(),
      projectId: "abc",
      description: "Some work",
      log: silentLog,
    });
    expect(result).toBeNull();
  });

  it("returns null when description is missing", async () => {
    const result = await classifyProject({
      mysqlQuery: vi.fn(),
      projectId: 1,
      description: "",
      log: silentLog,
    });
    expect(result).toBeNull();
  });

  it("returns null when LLM response is not valid JSON", async () => {
    mockComplete.mockResolvedValueOnce({
      text: "This is not JSON at all",
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const result = await classifyProject({
      mysqlQuery: vi.fn(),
      projectId: 1,
      description: "Some work needed",
      log: silentLog,
    });

    expect(result).toBeNull();
  });

  it("returns structured result even when DB insert fails", async () => {
    mockComplete.mockResolvedValueOnce({
      text: JSON.stringify(VALID_RESPONSE),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const mysqlQuery = vi.fn().mockRejectedValue(new Error("DB down"));

    const result = await classifyProject({
      mysqlQuery,
      projectId: 1,
      description: "Bathroom refit",
      log: silentLog,
    });

    expect(result).toEqual(VALID_RESPONSE);
  });

  it("returns null when LLM call throws", async () => {
    mockComplete.mockRejectedValueOnce(new Error("API timeout"));

    const result = await classifyProject({
      mysqlQuery: vi.fn(),
      projectId: 1,
      description: "Extension work",
      log: silentLog,
    });

    expect(result).toBeNull();
  });
});
