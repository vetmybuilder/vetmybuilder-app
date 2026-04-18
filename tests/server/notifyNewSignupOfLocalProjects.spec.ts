import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("../../server/lib/pushSender", () => ({
  sendPushToUser: vi.fn(),
}));

const { notifyNewSignupOfLocalProjects } = require("../../server/lib/notifyNewSignupOfLocalProjects");

describe("notifyNewSignupOfLocalProjects", () => {
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockBroadcast: ReturnType<typeof vi.fn>;
  let mockLogActivity: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQuery = vi.fn();
    mockBroadcast = vi.fn();
    mockLogActivity = vi.fn();
    // Default: all queries resolve to empty unless overridden
    mockQuery.mockResolvedValue({});
  });

  it("notifies user of live projects in their area", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 10, name: "Kitchen Refit in E4", type: "Kitchen", location: "E4" },
      { id: 11, name: "Bathroom in E4", type: "Bathroom", location: "E4" },
    ]);

    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      broadcastNotification: mockBroadcast,
      logActivity: mockLogActivity,
      uid: "new-user-1",
      location: "E4",
    });

    expect(mockBroadcast).toHaveBeenCalledTimes(2);
    expect(mockBroadcast).toHaveBeenCalledWith("new-user-1", expect.objectContaining({
      type: "project_live_local",
      projectId: 10,
    }));
    expect(mockBroadcast).toHaveBeenCalledWith("new-user-1", expect.objectContaining({
      type: "project_live_local",
      projectId: 11,
    }));
  });

  it("notification message includes the project name", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 10, name: "Kitchen Refit in E4", type: "Kitchen", location: "E4" },
    ]);

    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      broadcastNotification: mockBroadcast,
      uid: "new-user-msg",
      location: "E4",
    });

    expect(mockBroadcast).toHaveBeenCalledWith("new-user-msg", expect.objectContaining({
      message: expect.stringContaining("Kitchen Refit in E4"),
      linkPath: "/projects/10",
    }));
  });

  it("caps at 5 notifications (SQL LIMIT)", async () => {
    mockQuery.mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => ({
        id: 100 + i,
        name: `Project ${i}`,
        type: "General",
        location: "E4",
      })),
    );

    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      broadcastNotification: mockBroadcast,
      logActivity: mockLogActivity,
      uid: "new-user-2",
      location: "E4",
    });

    expect(mockBroadcast).toHaveBeenCalledTimes(5);
  });

  it("does nothing when location is empty", async () => {
    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      uid: "new-user-3",
      location: "",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("does nothing when location is undefined", async () => {
    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      uid: "new-user-undef",
      location: undefined,
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("does nothing when no projects exist in area", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      broadcastNotification: mockBroadcast,
      uid: "new-user-4",
      location: "E4",
    });

    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("never throws — returns silently on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));

    await expect(
      notifyNewSignupOfLocalProjects({
        mysqlQuery: mockQuery,
        uid: "new-user-5",
        location: "E4",
      }),
    ).resolves.toBeUndefined();
  });

  it("matches project location, not owner location", async () => {
    // The SQL query should contain p.location conditions, not u.postcode
    mockQuery.mockResolvedValueOnce([
      { id: 20, name: "Plumbing in E4", type: "Plumbing", location: "E4" },
    ]);

    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      broadcastNotification: mockBroadcast,
      uid: "new-user-loc",
      location: "E4",
    });

    // Verify the SELECT query matches against p.location
    const selectCall = mockQuery.mock.calls[0];
    const sql = selectCall[0] as string;
    expect(sql).toContain("p.location");
    expect(sql).toContain("p.status = 'live'");
    expect(sql).toContain("p.ownerUserId <> ?");
    expect(sql).not.toContain("u.postcode");

    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });

  it("excludes projects owned by the new user", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      broadcastNotification: mockBroadcast,
      uid: "new-user-own",
      location: "E4",
    });

    // The uid should be passed as the first param to exclude own projects
    const selectCall = mockQuery.mock.calls[0];
    const sql = selectCall[0] as string;
    const sqlParams = selectCall[1] as any[];
    expect(sql).toContain("p.ownerUserId <> ?");
    expect(sqlParams[0]).toBe("new-user-own");
  });

  it("handles full postcode — matches on outward code", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 30, name: "Roofing in E4", type: "Roofing", location: "E4" },
    ]);

    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      broadcastNotification: mockBroadcast,
      uid: "new-user-full-pc",
      location: "E4 6ST",
    });

    // Should still match — extractLocationTokens("E4 6ST") produces outward "E4"
    const selectCall = mockQuery.mock.calls[0];
    const sql = selectCall[0] as string;
    expect(sql).toContain("UPPER(p.location)");
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });

  it("works without broadcastNotification function", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 40, name: "Painting in E4", type: "Painting", location: "E4" },
    ]);

    await expect(
      notifyNewSignupOfLocalProjects({
        mysqlQuery: mockQuery,
        uid: "new-user-no-broadcast",
        location: "E4",
      }),
    ).resolves.toBeUndefined();

    // Should still insert notification even without broadcast
    // Check that at least 1 INSERT was made (SELECT + INSERT + push queries)
    const insertCalls = mockQuery.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO notifications"),
    );
    expect(insertCalls).toHaveLength(1);
  });

  it("logs activity when logActivity is provided", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 50, name: "Extension in E4", type: "Extension", location: "E4" },
    ]);

    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      broadcastNotification: mockBroadcast,
      logActivity: mockLogActivity,
      uid: "new-user-log",
      location: "E4",
    });

    expect(mockLogActivity).toHaveBeenCalledWith(
      "signup.local_projects_notified",
      "info",
      "new-user-log",
      expect.stringContaining("1 local project"),
    );
  });

  it("handles city-based location", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 60, name: "Work in London", type: "General", location: "london" },
    ]);

    await notifyNewSignupOfLocalProjects({
      mysqlQuery: mockQuery,
      broadcastNotification: mockBroadcast,
      uid: "new-user-city",
      location: "London",
    });

    const selectCall = mockQuery.mock.calls[0];
    const sql = selectCall[0] as string;
    expect(sql).toContain("LOWER(p.location)");
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });
});
