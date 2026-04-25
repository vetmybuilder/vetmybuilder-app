import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/projects/inbox.get.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  mount({ get: (_p: string, _a: any, h: any) => { captured = h; } }, ctx);
  if (!captured) throw new Error("handler not captured");
  return captured;
}
function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("GET /api/projects/:id/inbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when viewer isn't the project owner", async () => {
    const q = vi.fn().mockResolvedValueOnce([{ ownerUserId: "someone-else" }]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns pitches with derived status='new' for the owner", async () => {
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
    const tradesmanCreatedAt = new Date(Date.now() - 12 * 365 * 24 * 60 * 60 * 1000);
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ ownerUserId: "u1" }])
      .mockResolvedValueOnce([
        {
          id: 1,
          builder_uid: "b1",
          intro_message: "Hi",
          homeowner_replied_at: null,
          dismissed_at: null,
          created_at: createdAt,
          updated_at: createdAt,
          hours_ago: 2,
          company_name: "BCo",
          tradesman_created_at: tradesmanCreatedAt,
          service_areas: "E4,E17",
          builder_first_name: "James",
          builder_outward: "E4",
        },
      ]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.pitches).toHaveLength(1);
    expect(body.pitches[0]).toMatchObject({
      messageId: "1",
      builderFirstName: "James",
      companyName: "BCo",
      outward: "E4",
      body: "Hi",
      hoursAgo: 2,
      status: "new",
    });
    expect(body.pitches[0].yearsTrading).toBeGreaterThan(0);
  });

  it("returns empty pitches when no messages exist", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ ownerUserId: "u1" }])
      .mockResolvedValueOnce([]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.pitches).toHaveLength(0);
  });

  it("marks status='replied' when homeowner_replied_at is set", async () => {
    const replyDate = new Date();
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ ownerUserId: "u1" }])
      .mockResolvedValueOnce([
        {
          id: 2,
          builder_uid: "b2",
          intro_message: "Check this out",
          homeowner_replied_at: replyDate,
          dismissed_at: null,
          created_at: new Date(),
          updated_at: replyDate,
          hours_ago: 0,
          company_name: "Builder Co",
          tradesman_created_at: null,
          service_areas: null,
          builder_first_name: "Peter",
          builder_outward: "E17",
        },
      ]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.pitches[0].status).toBe("replied");
  });

  it("marks status='dismissed' when dismissed_at is set (even if replied_at also set)", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ ownerUserId: "u1" }])
      .mockResolvedValueOnce([
        {
          id: 3,
          builder_uid: "b3",
          intro_message: "Dismissed pitch",
          homeowner_replied_at: new Date(),
          dismissed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          hours_ago: 48,
          company_name: "D Co",
          tradesman_created_at: null,
          service_areas: "E4",
          builder_first_name: "Sam",
          builder_outward: null,
        },
      ]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    const body = res.json.mock.calls[0][0];
    expect(body.pitches[0].status).toBe("dismissed");
    // Falls back to service_areas when builder_outward is null
    expect(body.pitches[0].outward).toBe("E4");
  });
});
