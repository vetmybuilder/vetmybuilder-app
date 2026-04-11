import { describe, it, expect, vi, beforeEach } from "vitest";

const googlePlaces = require("../../server/lib/googlePlaces");
const llmClient = require("../../server/lib/ai/llmClient");

describe("googleEnricher", () => {
  let mockedLookup: ReturnType<typeof vi.fn>;
  let mockedDetails: ReturnType<typeof vi.fn>;
  let mockedComplete: ReturnType<typeof vi.fn>;
  let enrichTradesmanWithGoogle: any;

  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedLookup = vi.spyOn(googlePlaces, "lookupBusiness");
    mockedDetails = vi.spyOn(googlePlaces, "getPlaceDetails");
    mockedComplete = vi.spyOn(llmClient, "complete").mockResolvedValue({
      text: "{}",
      mode: "stub",
      costPence: 0,
      latencyMs: 0,
    });

    // Import after spies are set up
    ({ enrichTradesmanWithGoogle } = require("../../server/lib/ai/googleEnricher"));
  });

  it("enriches a tradesman when Google match is verified by LLM", async () => {
    mockedLookup.mockResolvedValueOnce({
      placeId: "ChIJ123",
      rating: 4.8,
      userRatingsTotal: 25,
      name: "Elegant Building Services Ltd",
      address: "20 Simmons Ln, London E4",
    });

    mockedComplete.mockResolvedValueOnce({
      text: JSON.stringify({ match: true, confidence: "high" }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    mockedDetails.mockResolvedValueOnce({ website: "https://elegantbuilding.co.uk" });

    const upserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/UPDATE tradesmen/.test(sql)) upserted.push(params);
      return [];
    });

    const result = await enrichTradesmanWithGoogle({
      mysqlQuery,
      userId: "uid-1",
      companyName: "Elegant Building Services",
      locationHint: "London",
      existingWebUrl: null,
      log,
    });

    expect(result).not.toBeNull();
    expect(result.placeId).toBe("ChIJ123");
    expect(result.rating).toBe(4.8);
    expect(result.reviewsCount).toBe(25);
    expect(result.website).toBe("https://elegantbuilding.co.uk");
    expect(upserted).toHaveLength(1);
  });

  it("returns null when LLM rejects the match", async () => {
    mockedLookup.mockResolvedValueOnce({
      placeId: "ChIJ999",
      rating: 3.0,
      userRatingsTotal: 5,
      name: "Different Company Entirely",
      address: "Some address",
    });

    mockedComplete.mockResolvedValueOnce({
      text: JSON.stringify({ match: false, confidence: "high" }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const mysqlQuery = vi.fn();

    const result = await enrichTradesmanWithGoogle({
      mysqlQuery,
      userId: "uid-2",
      companyName: "My Real Company",
      locationHint: "London",
      log,
    });

    expect(result).toBeNull();
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("returns null when LLM match has low confidence", async () => {
    mockedLookup.mockResolvedValueOnce({
      placeId: "ChIJ456",
      rating: 4.0,
      userRatingsTotal: 10,
      name: "Similar Name Ltd",
      address: "Some address",
    });

    mockedComplete.mockResolvedValueOnce({
      text: JSON.stringify({ match: true, confidence: "low" }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const mysqlQuery = vi.fn();

    const result = await enrichTradesmanWithGoogle({
      mysqlQuery,
      userId: "uid-3",
      companyName: "Similar Name",
      log,
    });

    expect(result).toBeNull();
  });

  it("skips Place Details when tradesman already has web_url", async () => {
    mockedLookup.mockResolvedValueOnce({
      placeId: "ChIJ789",
      rating: 4.5,
      userRatingsTotal: 15,
      name: "Test Co",
      address: "London",
    });

    mockedComplete.mockResolvedValueOnce({
      text: JSON.stringify({ match: true, confidence: "high" }),
      mode: "stub",
      costPence: 0,
      latencyMs: 5,
    });

    const mysqlQuery = vi.fn().mockResolvedValue([]);

    const result = await enrichTradesmanWithGoogle({
      mysqlQuery,
      userId: "uid-4",
      companyName: "Test Co",
      existingWebUrl: "https://existing-site.com",
      log,
    });

    expect(result).not.toBeNull();
    expect(mockedDetails).not.toHaveBeenCalled();
    expect(result.website).toBeNull();
  });

  it("returns null when no Google result found", async () => {
    mockedLookup.mockResolvedValueOnce(null);

    const mysqlQuery = vi.fn();

    const result = await enrichTradesmanWithGoogle({
      mysqlQuery,
      userId: "uid-5",
      companyName: "Nonexistent Company",
      log,
    });

    expect(result).toBeNull();
    expect(mockedComplete).not.toHaveBeenCalled();
  });

  it("never throws — returns null on any error", async () => {
    mockedLookup.mockRejectedValueOnce(new Error("Network down"));

    const mysqlQuery = vi.fn();

    const result = await enrichTradesmanWithGoogle({
      mysqlQuery,
      userId: "uid-6",
      companyName: "Error Co",
      log,
    });

    expect(result).toBeNull();
  });
});
