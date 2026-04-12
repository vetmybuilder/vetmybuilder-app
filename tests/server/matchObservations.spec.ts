import { describe, it, expect, vi } from "vitest";

const {
  logSurfacings,
  recordHomeownerAction,
  recordHireOutcome,
} = require("../../server/lib/observability/matchObservations");

const silentLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("matchObservations", () => {
  describe("logSurfacings", () => {
    it("inserts one row per item in a single query", async () => {
      const queries: { sql: string; params: any[] }[] = [];
      const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
        queries.push({ sql, params });
      });

      await logSurfacings({
        mysqlQuery,
        projectId: 1,
        surfaceContext: "top_recommendations",
        items: [
          { recommendationId: 10, score: 85 },
          { tradesmanUserId: "trade-1", score: 60 },
        ],
        log: silentLog,
      });

      expect(queries).toHaveLength(1);
      expect(queries[0].sql).toContain("INSERT INTO match_observations");
      expect(queries[0].params).toContain(1); // project_id
      expect(queries[0].params).toContain(10); // recommendation_id
      expect(queries[0].params).toContain("trade-1"); // tradesman_user_id
    });

    it("skips items with no recommendation_id or tradesman_user_id", async () => {
      const mysqlQuery = vi.fn().mockResolvedValue([]);

      await logSurfacings({
        mysqlQuery,
        projectId: 1,
        surfaceContext: "jobs_list",
        items: [{ score: 50 }], // no id
        log: silentLog,
      });

      expect(mysqlQuery).not.toHaveBeenCalled();
    });

    it("does nothing when mysqlQuery is null", async () => {
      await logSurfacings({
        mysqlQuery: null,
        projectId: 1,
        surfaceContext: "test",
        items: [{ recommendationId: 1 }],
        log: silentLog,
      });
      // no error
    });

    it("does nothing when items is empty", async () => {
      const mysqlQuery = vi.fn();
      await logSurfacings({
        mysqlQuery,
        projectId: 1,
        surfaceContext: "test",
        items: [],
        log: silentLog,
      });
      expect(mysqlQuery).not.toHaveBeenCalled();
    });

    it("never throws on DB error", async () => {
      const mysqlQuery = vi.fn().mockRejectedValue(new Error("DB down"));

      await expect(
        logSurfacings({
          mysqlQuery,
          projectId: 1,
          surfaceContext: "test",
          items: [{ recommendationId: 1 }],
          log: silentLog,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe("recordHomeownerAction", () => {
    it("updates the most recent observation row", async () => {
      const mysqlQuery = vi.fn().mockResolvedValue({ affectedRows: 1 });

      await recordHomeownerAction({
        mysqlQuery,
        projectId: 1,
        recommendationId: 10,
        action: "clicked",
        log: silentLog,
      });

      expect(mysqlQuery).toHaveBeenCalledTimes(1);
      const sql = mysqlQuery.mock.calls[0][0];
      expect(sql).toContain("UPDATE match_observations");
      expect(sql).toContain("homeowner_action");
    });

    it("inserts a synthetic row when no prior surfacing exists", async () => {
      const mysqlQuery = vi.fn().mockResolvedValue({ affectedRows: 0 });

      await recordHomeownerAction({
        mysqlQuery,
        projectId: 1,
        tradesmanUserId: "trade-1",
        action: "hired",
        log: silentLog,
      });

      expect(mysqlQuery).toHaveBeenCalledTimes(2);
      expect(mysqlQuery.mock.calls[1][0]).toContain("INSERT INTO match_observations");
      expect(mysqlQuery.mock.calls[1][0]).toContain("hire_created");
    });

    it("does nothing when action is missing", async () => {
      const mysqlQuery = vi.fn();
      await recordHomeownerAction({
        mysqlQuery,
        projectId: 1,
        recommendationId: 10,
        action: "",
        log: silentLog,
      });
      expect(mysqlQuery).not.toHaveBeenCalled();
    });

    it("never throws on DB error", async () => {
      const mysqlQuery = vi.fn().mockRejectedValue(new Error("DB down"));
      await expect(
        recordHomeownerAction({
          mysqlQuery,
          projectId: 1,
          recommendationId: 10,
          action: "clicked",
          log: silentLog,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe("recordHireOutcome", () => {
    it("updates the observation row with the hire outcome", async () => {
      const mysqlQuery = vi.fn().mockResolvedValue({ affectedRows: 1 });

      await recordHireOutcome({
        mysqlQuery,
        projectId: 1,
        recommendationId: 10,
        outcome: "accepted",
        log: silentLog,
      });

      expect(mysqlQuery).toHaveBeenCalledTimes(1);
      expect(mysqlQuery.mock.calls[0][0]).toContain("hire_outcome");
    });

    it("does nothing when outcome is missing", async () => {
      const mysqlQuery = vi.fn();
      await recordHireOutcome({
        mysqlQuery,
        projectId: 1,
        recommendationId: 10,
        outcome: "",
        log: silentLog,
      });
      expect(mysqlQuery).not.toHaveBeenCalled();
    });

    it("never throws on DB error", async () => {
      const mysqlQuery = vi.fn().mockRejectedValue(new Error("DB down"));
      await expect(
        recordHireOutcome({
          mysqlQuery,
          projectId: 1,
          tradesmanUserId: "trade-1",
          outcome: "declined",
          log: silentLog,
        })
      ).resolves.toBeUndefined();
    });
  });
});
