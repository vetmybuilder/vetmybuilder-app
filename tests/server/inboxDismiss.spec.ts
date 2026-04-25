import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/projects/inbox-dismiss.post.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  mount(
    { post: (_p: string, _a: any, h: any) => { captured = h; } },
    ctx,
  );
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("POST /api/projects/:projectId/inbox/:messageId/dismiss", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dismisses a message owned by this homeowner", async () => {
    const q = vi
      .fn()
      // ownership check — row exists for this homeowner
      .mockResolvedValueOnce([{ id: 1 }])
      // dismiss update
      .mockResolvedValueOnce({ affectedRows: 1 });

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "ho1" },
        params: { id: "1", messageId: "1" },
      },
      res,
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dismissed" }),
    );

    // Verify ownership SELECT targets inbox_messages + homeowner_uid match.
    const selectSql = q.mock.calls[0][0];
    expect(selectSql).toMatch(/FROM inbox_messages/i);
    expect(selectSql).toMatch(/homeowner_uid/i);

    // Verify the UPDATE sets dismissed_at.
    const updateSql = q.mock.calls[1][0];
    expect(updateSql).toMatch(/UPDATE inbox_messages/i);
    expect(updateSql).toMatch(/dismissed_at/i);
  });

  it("404 when the message doesn't belong to this homeowner", async () => {
    const q = vi.fn().mockResolvedValueOnce([]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "ho1" },
        params: { id: "1", messageId: "1" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    // Should not run the UPDATE.
    expect(q).toHaveBeenCalledTimes(1);
  });
});
