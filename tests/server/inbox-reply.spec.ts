import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/projects/inbox-reply.post.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  mount({ post: (_p: string, _a: any, h: any) => { captured = h; } }, ctx);
  if (!captured) throw new Error("handler not captured");
  return captured;
}
function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("POST /api/projects/:id/inbox/:messageId/reply", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when message missing or not yours", async () => {
    const q = vi.fn().mockResolvedValueOnce([]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      { user: { uid: "u1" }, params: { id: "1", messageId: "99" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("marks homeowner_replied_at and returns ok", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 5,
          project_id: 1,
          homeowner_uid: "u1",
          builder_uid: "b1",
          homeowner_replied_at: null,
        },
      ])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      { user: { uid: "u1" }, params: { id: "1", messageId: "5" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const update = q.mock.calls[1][0];
    expect(update).toMatch(/UPDATE inbox_messages/i);
    expect(update).toMatch(/homeowner_replied_at/);
  });
});
