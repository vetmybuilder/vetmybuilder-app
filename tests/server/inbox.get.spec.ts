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

  it("returns inbox items for the owner", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ ownerUserId: "u1" }])
      .mockResolvedValueOnce([
        {
          id: 1,
          builder_uid: "b1",
          intro_message: "Hi",
          homeowner_replied_at: null,
          created_at: new Date(),
          company_name: "BCo",
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
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: 1,
      builderUid: "b1",
      builderName: "BCo",
      introMessage: "Hi",
      replied: false,
    });
  });

  it("returns empty inbox when no messages exist", async () => {
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
    expect(body.items).toHaveLength(0);
  });

  it("marks replied=true when homeowner_replied_at is set", async () => {
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
          created_at: new Date(),
          company_name: "Builder Co",
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
    expect(body.items[0].replied).toBe(true);
  });
});
