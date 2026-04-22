import { describe, it, expect, vi } from "vitest";

const { normaliseSubtype, parsePriceBand, formatPriceBand, getPriceBand } = require("../../server/lib/pricingLookup");

describe("pricingLookup", () => {
  describe("normaliseSubtype", () => {
    it("lowercases and replaces non-alphanumeric with underscores", () => {
      expect(normaliseSubtype("Deep Clean (Kitchen/Bathroom)")).toBe("deep_clean_kitchen_bathroom");
    });

    it("trims leading and trailing underscores", () => {
      expect(normaliseSubtype("  /Hello World/  ")).toBe("hello_world");
    });

    it("returns empty string for null", () => {
      expect(normaliseSubtype(null)).toBe("");
    });
  });

  describe("parsePriceBand", () => {
    it("parses standard price band string", () => {
      expect(parsePriceBand("£5,000-£15,000")).toEqual({ min: 500000, max: 1500000 });
    });

    it("parses small values", () => {
      expect(parsePriceBand("£50-£100")).toEqual({ min: 5000, max: 10000 });
    });

    it("returns null for invalid input", () => {
      expect(parsePriceBand("not a price")).toBeNull();
      expect(parsePriceBand(null)).toBeNull();
      expect(parsePriceBand("")).toBeNull();
    });
  });

  describe("formatPriceBand", () => {
    it("formats pence to pounds with comma separators", () => {
      expect(formatPriceBand(500000, 1500000)).toBe("\u00a35,000-\u00a315,000");
    });

    it("formats small values", () => {
      expect(formatPriceBand(5000, 10000)).toBe("\u00a350-\u00a3100");
    });
  });

  describe("getPriceBand", () => {
    it("returns cached price from DB if available", async () => {
      const mysqlQuery = vi.fn().mockResolvedValue([{ min_pence: 15000, max_pence: 40000 }]);
      const result = await getPriceBand({
        mysqlQuery,
        subtype: "Deep Clean",
        classificationPriceBand: "£500-£1,000",
      });
      expect(result).toBe("\u00a3150-\u00a3400");
    });

    it("stores AI estimate in DB when not cached", async () => {
      const calls: any[] = [];
      const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
        calls.push({ sql, params });
        if (sql.includes("SELECT")) return [];
        return [];
      });
      await getPriceBand({
        mysqlQuery,
        subtype: "Deep Clean",
        classificationPriceBand: "£150-£400",
      });
      const insert = calls.find((c) => c.sql.includes("INSERT"));
      expect(insert).toBeTruthy();
      expect(insert.params).toContain(15000);
      expect(insert.params).toContain(40000);
    });

    it("returns classification price when DB fails", async () => {
      const mysqlQuery = vi.fn().mockRejectedValue(new Error("DB down"));
      const result = await getPriceBand({
        mysqlQuery,
        subtype: "Deep Clean",
        classificationPriceBand: "£150-£400",
      });
      expect(result).toBe("£150-£400");
    });
  });
});
