import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const swipeMount = require("../../server/routes/projects/swipe.post.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  swipeMount(
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

describe("POST /api/projects/:id/swipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when direction is missing or invalid", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "up" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when builderUid missing", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler(
      { user: { uid: "u1" }, params: { id: "1" }, body: { direction: "right" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("upserts a pending row on right-swipe", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "u1" }]) // project check
      .mockResolvedValueOnce([{ user_id: "b1" }]) // builder exists
      // The route now does a "preserve source" SELECT before the UPSERT
      // so paid_unlock source isn't clobbered by a homeowner re-swipe.
      // Empty result here means there's no existing row, fresh insert.
      .mockResolvedValueOnce([]) // SELECT source FROM swipe_interest (preserve)
      .mockResolvedValueOnce({ affectedRows: 1 }); // UPSERT
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "right", source: "subscribed" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const upsert = q.mock.calls[3][0];
    expect(upsert).toMatch(/INSERT INTO swipe_interest/i);
    expect(upsert).toMatch(/status/i);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, status: "pending" }),
    );
  });

  it("records declined_by_homeowner on left-swipe", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "u1" }])
      .mockResolvedValueOnce([{ user_id: "b1" }])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "left", source: "subscribed" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "declined_by_homeowner" }),
    );
  });
});
