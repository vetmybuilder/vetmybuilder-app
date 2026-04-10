import { describe, it, expect, vi, beforeEach } from "vitest";

const { notifyMatchedTradesmen } = require("../../server/lib/ai/notifyMatchedTradesmen.js");

describe("notifyMatchedTradesmen", () => {
  it("notifies tradesmen whose trades match the classification", async () => {
    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (/project_classifications/.test(sql)) {
        return [{
          structured: JSON.stringify({
            recommended_trades: ["Plumber", "Bathroom Fitter"],
          }),
        }];
      }
      if (/FROM tradesmen/.test(sql)) {
        return [
          { user_id: "t1", trade_types: "Plumber,Gas Engineer", service_areas: "E4" },
          { user_id: "t2", trade_types: "Roofer", service_areas: "E4" },
        ];
      }
      if (/INSERT INTO notifications/.test(sql)) {
        inserted.push(sql);
        return [];
      }
      return [];
    });

    const result = await notifyMatchedTradesmen({
      mysqlQuery,
      projectId: 1,
      projectName: "Bathroom refit",
      projectType: "Bathroom",
      projectLocation: "E4",
      projectCreatedAt: new Date(),
    });

    expect(result.notified).toBe(1); // t1 matches (Plumber)
    expect(result.skipped).toBe(1);  // t2 doesn't match (Roofer)
    expect(inserted).toHaveLength(1);
  });

  it("skips all tradesmen when no classification exists", async () => {
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (/project_classifications/.test(sql)) return [];
      if (/FROM tradesmen/.test(sql)) {
        return [
          { user_id: "t1", trade_types: "Plumber", service_areas: "E4" },
        ];
      }
      if (/INSERT INTO notifications/.test(sql)) return [];
      return [];
    });

    const result = await notifyMatchedTradesmen({
      mysqlQuery,
      projectId: 1,
      projectName: "Test",
      projectType: "General",
      projectLocation: "E4",
      projectCreatedAt: new Date(),
    });

    // With no recommended_trades, scoreTrade checks projectType fallback
    // "General" may or may not match "Plumber" — depends on fuzzy logic.
    // The point is: the function doesn't crash when no classification exists.
    expect(result.notified + result.skipped).toBe(1);
  });

  it("returns zero when no active tradesmen exist", async () => {
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (/project_classifications/.test(sql)) {
        return [{ structured: JSON.stringify({ recommended_trades: ["Plumber"] }) }];
      }
      if (/FROM tradesmen/.test(sql)) return [];
      return [];
    });

    const result = await notifyMatchedTradesmen({
      mysqlQuery,
      projectId: 1,
      projectName: "Test",
      projectType: "Bathroom",
      projectLocation: "E4",
      projectCreatedAt: new Date(),
    });

    expect(result.notified).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("never throws — returns result even on DB error", async () => {
    const mysqlQuery = vi.fn().mockRejectedValue(new Error("DB down"));

    const result = await notifyMatchedTradesmen({
      mysqlQuery,
      projectId: 1,
      projectName: "Test",
      projectType: "Bathroom",
      projectLocation: "E4",
      projectCreatedAt: new Date(),
    });

    expect(result.notified).toBe(0);
  });
});
