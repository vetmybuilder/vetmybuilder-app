import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("llmClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.LLM_MODE = "stub";
    process.env.NODE_ENV = "test";
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function loadClient() {
    return require("../../server/lib/ai/llmClient");
  }

  it("returns stub response in stub mode", async () => {
    const { complete } = loadClient();
    const mysqlQuery = vi.fn().mockResolvedValue([]);

    const result = await complete({
      feature: "test_feature",
      system: "You are a test assistant.",
      user: "Say hello",
      stub: '{"greeting":"hello"}',
      mysqlQuery,
    });

    expect(result.text).toBe('{"greeting":"hello"}');
    expect(result.mode).toBe("stub");
    expect(result.costPence).toBe(0);
  });

  it("logs inference to ai_inference_log", async () => {
    const { complete } = loadClient();
    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/INSERT INTO ai_inference_log/.test(sql)) inserted.push(params);
      return [];
    });

    await complete({
      feature: "test_log",
      system: "System prompt",
      user: "User prompt",
      stub: "stub response",
      mysqlQuery,
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toContain("test_log");
  });

  it("throws when feature is missing", async () => {
    const { complete } = loadClient();
    await expect(
      complete({ feature: "", system: "s", user: "u", stub: "s", mysqlQuery: vi.fn() })
    ).rejects.toThrow("feature is required");
  });

  it("throws when user is not a string", async () => {
    const { complete } = loadClient();
    await expect(
      complete({ feature: "f", system: "s", user: 123, stub: "s", mysqlQuery: vi.fn() })
    ).rejects.toThrow("user must be a string");
  });

  it("throws when stub is not a string", async () => {
    const { complete } = loadClient();
    await expect(
      complete({ feature: "f", system: "s", user: "u", stub: null, mysqlQuery: vi.fn() })
    ).rejects.toThrow("stub fallback is required");
  });

  it("does not throw when mysqlQuery fails during logging", async () => {
    const { complete } = loadClient();
    const mysqlQuery = vi.fn().mockRejectedValue(new Error("DB down"));

    const result = await complete({
      feature: "test_resilient",
      system: "s",
      user: "u",
      stub: "fallback",
      mysqlQuery,
    });

    expect(result.text).toBe("fallback");
  });
});
