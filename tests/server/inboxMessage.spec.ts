import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/projects/inbox-message.post.js");

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

describe("POST /api/projects/:id/inbox-message", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the builder's intro message body against their existing unlock", async () => {
    const q = vi
      .fn()
      // unlock lookup — builder has an active unlock for this project
      .mockResolvedValueOnce([{ id: 42 }])
      // UPDATE inbox_messages — one row updated
      .mockResolvedValueOnce({ affectedRows: 1 });

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "builder-1" },
        params: { id: "1" },
        body: { body: "Hi Sarah, I'm James..." },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent" }),
    );

    // Verify the unlock lookup uses the right table/columns.
    const selectSql = q.mock.calls[0][0];
    expect(selectSql).toMatch(/FROM project_contact_unlocks/i);
    expect(selectSql).toMatch(/buyer_uid/i);

    // Verify the UPDATE targets inbox_messages with intro_message body.
    const updateSql = q.mock.calls[1][0];
    expect(updateSql).toMatch(/UPDATE inbox_messages/i);
    expect(updateSql).toMatch(/intro_message/i);
    const updateArgs = q.mock.calls[1][1];
    expect(updateArgs[0]).toBe("Hi Sarah, I'm James...");
  });

  it("rejects when builder has no unlock for this project", async () => {
    const q = vi.fn().mockResolvedValueOnce([]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "builder-1" },
        params: { id: "99" },
        body: { body: "hi" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("rejects empty body", async () => {
    const q = vi.fn();
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "builder-1" },
        params: { id: "1" },
        body: { body: "" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    // Should not even hit the DB for empty bodies.
    expect(q).not.toHaveBeenCalled();
  });
});
