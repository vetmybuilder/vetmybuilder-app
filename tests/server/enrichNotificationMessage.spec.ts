import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const llmClient = require("../../server/lib/ai/llmClient");

describe("enrichNotificationMessage", () => {
  let enrichMessage: any;
  let ENRICHABLE_TYPES: string[];
  let mockComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockComplete = vi.spyOn(llmClient, "complete");
    mockComplete.mockReset();
    const mod = require("../../server/lib/ai/enrichNotificationMessage");
    enrichMessage = mod.enrichMessage;
    ENRICHABLE_TYPES = mod.ENRICHABLE_TYPES;
  });

  it("enriches a supported notification type", async () => {
    mockComplete.mockResolvedValueOnce({
      text: "Great news — you've been selected for the Kitchen Extension project!",
      mode: "real",
      costPence: 1,
      latencyMs: 80,
    });

    const result = await enrichMessage({
      type: "hire_received",
      templateMessage: 'You\'ve been hired for "Kitchen Extension"',
      context: { projectName: "Kitchen Extension" },
      mysqlQuery: vi.fn(),
    });

    expect(result).toBe(
      "Great news — you've been selected for the Kitchen Extension project!"
    );
    expect(mockComplete).toHaveBeenCalledOnce();
    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "notification_enrichment",
        maxTokens: 128,
      })
    );
  });

  it("returns template unchanged for unsupported type", async () => {
    const template = "System broadcast: maintenance window tonight";

    const result = await enrichMessage({
      type: "system_broadcast",
      templateMessage: template,
      mysqlQuery: vi.fn(),
    });

    expect(result).toBe(template);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("falls back to template when LLM call rejects", async () => {
    mockComplete.mockRejectedValueOnce(new Error("API timeout"));

    const template = 'You\'ve been hired for "Bathroom Refit"';
    const result = await enrichMessage({
      type: "hire_received",
      templateMessage: template,
      context: { projectName: "Bathroom Refit" },
      mysqlQuery: vi.fn(),
    });

    expect(result).toBe(template);
  });

  it("ENRICHABLE_TYPES contains the correct types", () => {
    expect(ENRICHABLE_TYPES).toContain("hire_received");
    expect(ENRICHABLE_TYPES).toContain("hire_accepted");
    expect(ENRICHABLE_TYPES).toContain("hire_declined");
    expect(ENRICHABLE_TYPES).toContain("recommendation_for_tradesman");
    expect(ENRICHABLE_TYPES).toContain("tradesman_interest");
    expect(ENRICHABLE_TYPES).toContain("tradesman_shared_profile");
  });

  it("ENRICHABLE_TYPES excludes broadcast types", () => {
    expect(ENRICHABLE_TYPES).not.toContain("system_broadcast");
    expect(ENRICHABLE_TYPES).not.toContain("admin_broadcast");
    expect(ENRICHABLE_TYPES).not.toContain("broadcast");
  });
});
