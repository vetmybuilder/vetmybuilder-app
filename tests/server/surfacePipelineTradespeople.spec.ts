import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

const { surfacePipelineTradespeople } = require("../../server/lib/surfacePipelineTradespeople.js");

const CANDIDATE = {
  id: 1,
  company_name: "Acme Plumbing Ltd",
  email: "hello@acme.co.uk",
  phone: "07700900000",
  website: "https://acme.co.uk",
  google_rating: 4.8,
  google_reviews_count: 120,
  company_number: "12345678",
};

describe("surfacePipelineTradespeople", () => {
  it("inserts pipeline recommendations for matching entries", async () => {
    const insertedRecs: any[] = [];

    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (/project_classifications/.test(sql)) {
        return [{ structured: JSON.stringify({ recommended_trades: ["Plumber"] }) }];
      }
      if (/FROM tradesperson_pipeline/.test(sql)) {
        return [CANDIDATE];
      }
      if (/SELECT company FROM recommendations/.test(sql)) {
        return [];
      }
      if (/SELECT ownerUserId FROM projects/.test(sql)) {
        return [{ ownerUserId: "user-123" }];
      }
      if (/INSERT INTO recommendations/.test(sql)) {
        insertedRecs.push(params);
        return [];
      }
      if (/INSERT INTO notifications/.test(sql)) {
        return [];
      }
      return [];
    });

    const broadcastNotification = vi.fn();
    const logActivity = vi.fn();

    await surfacePipelineTradespeople({
      mysqlQuery,
      projectId: 42,
      projectType: "Plumber",
      projectLocation: "E4 0AW",
      broadcastNotification,
      logActivity,
    });

    expect(insertedRecs).toHaveLength(1);
    const params = insertedRecs[0];
    expect(params[0]).toBe(42);                        // projectId
    expect(params[2]).toBe("Acme Plumbing Ltd");       // company_name
    expect(params[3]).toBe("hello@acme.co.uk");        // email
    expect(broadcastNotification).toHaveBeenCalledOnce();
    expect(logActivity).toHaveBeenCalledWith(
      "pipeline.surface",
      "info",
      "system",
      expect.stringContaining("1 pipeline rec(s)"),
    );
  });

  it("skips when company already recommended on the project", async () => {
    const insertedRecs: any[] = [];

    const mysqlQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (/project_classifications/.test(sql)) {
        return [{ structured: JSON.stringify({ recommended_trades: ["Plumber"] }) }];
      }
      if (/FROM tradesperson_pipeline/.test(sql)) {
        return [CANDIDATE];
      }
      if (/SELECT company FROM recommendations/.test(sql)) {
        // Return the same company so dedup fires
        return [{ company: "Acme Plumbing Ltd" }];
      }
      if (/SELECT ownerUserId FROM projects/.test(sql)) {
        return [{ ownerUserId: "user-123" }];
      }
      if (/INSERT INTO recommendations/.test(sql)) {
        insertedRecs.push(sql);
        return [];
      }
      return [];
    });

    await surfacePipelineTradespeople({
      mysqlQuery,
      projectId: 42,
      projectType: "Plumber",
      projectLocation: "E4 0AW",
    });

    expect(insertedRecs).toHaveLength(0);
  });

  it("does nothing when no location provided", async () => {
    const mysqlQuery = vi.fn();

    await surfacePipelineTradespeople({
      mysqlQuery,
      projectId: 42,
      projectType: "Plumber",
      projectLocation: "",
    });

    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("does nothing when no candidates match", async () => {
    const insertedRecs: any[] = [];

    const mysqlQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (/project_classifications/.test(sql)) {
        return [{ structured: JSON.stringify({ recommended_trades: ["Plumber"] }) }];
      }
      if (/FROM tradesperson_pipeline/.test(sql)) {
        return [];
      }
      if (/INSERT INTO recommendations/.test(sql)) {
        insertedRecs.push(sql);
        return [];
      }
      return [];
    });

    await surfacePipelineTradespeople({
      mysqlQuery,
      projectId: 42,
      projectType: "Plumber",
      projectLocation: "E4 0AW",
    });

    expect(insertedRecs).toHaveLength(0);
  });

  it("never throws on DB error", async () => {
    const mysqlQuery = vi.fn().mockRejectedValue(new Error("DB down"));

    await expect(
      surfacePipelineTradespeople({
        mysqlQuery,
        projectId: 42,
        projectType: "Plumber",
        projectLocation: "E4 0AW",
      }),
    ).resolves.toBeUndefined();
  });
});
