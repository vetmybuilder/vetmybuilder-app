import { describe, it, expect, vi, beforeEach } from "vitest";

describe("activityLog", () => {
  let logActivity: Function;
  let mockMysqlQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    mockMysqlQuery = vi.fn().mockResolvedValue([]);

    const mod = await import("../../server/lib/activityLog.js");
    logActivity = mod.makeLogActivity(mockMysqlQuery);
  });

  it("inserts a row into activity_log", async () => {
    await logActivity("project.publish", "info", "user-123", "Published project #42");

    expect(mockMysqlQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockMysqlQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO activity_log");
    expect(params).toEqual(["project.publish", "info", "user-123", "Published project #42"]);
  });

  it("defaults level to info when omitted", async () => {
    await logActivity("sse.connect", undefined, "user-456", "Connected");

    const [, params] = mockMysqlQuery.mock.calls[0];
    expect(params[1]).toBe("info");
  });

  it("swallows insert errors silently", async () => {
    mockMysqlQuery.mockRejectedValueOnce(new Error("DB down"));

    await logActivity("sse.disconnect", "info", "user-789", "Disconnected");
  });

  it("also logs via Pino", async () => {
    const mod = await import("../../server/lib/activityLog.js");
    const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logWithPino = mod.makeLogActivity(mockMysqlQuery, mockLog);

    await logWithPino("hire.accept", "info", "user-1", "Hire #5 accepted");

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "hire.accept", actorUid: "user-1" }),
      "Hire #5 accepted",
    );
  });

  it("uses error level for Pino when level is error", async () => {
    const mod = await import("../../server/lib/activityLog.js");
    const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logWithPino = mod.makeLogActivity(mockMysqlQuery, mockLog);

    await logWithPino("sse.broadcast.fail", "error", "system", "Connection reset");

    expect(mockLog.error).toHaveBeenCalled();
  });
});
