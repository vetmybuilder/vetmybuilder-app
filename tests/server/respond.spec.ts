import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockIsBuilderSubscribed = vi.fn();
vi.mock("../../server/lib/subscriptions/isBuilderSubscribed.js", () => ({
  isBuilderSubscribed: mockIsBuilderSubscribed,
}));
const {
  isBuilderSubscribed,
} = require("../../server/lib/subscriptions/isBuilderSubscribed.js");

const mount = require("../../server/routes/swipe/respond.post.js");

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

describe("POST /api/swipe-interest/:id/respond", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when swipe row doesn't exist or not ours", async () => {
    const q = vi.fn().mockResolvedValueOnce([]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      { user: { uid: "b1" }, params: { id: "1" }, body: { direction: "right" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when subscribed-source right-swipe but builder not subscribed", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 1, builder_uid: "b1", project_id: 1, source: "subscribed", status: "pending" },
      ]);
    mockIsBuilderSubscribed.mockResolvedValueOnce(false);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      { user: { uid: "b1" }, params: { id: "1" }, body: { direction: "right" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("accepts recommended-source right-swipe regardless of subscription", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 1, builder_uid: "b1", project_id: 1, source: "recommended", status: "pending" },
      ])
      .mockResolvedValueOnce({ affectedRows: 1 });
    mockIsBuilderSubscribed.mockResolvedValue(false);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      { user: { uid: "b1" }, params: { id: "1" }, body: { direction: "right" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "matched" }),
    );
  });

  it("marks declined_by_builder on left-swipe (no sub check)", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 1, builder_uid: "b1", project_id: 1, source: "subscribed", status: "pending" },
      ])
      .mockResolvedValueOnce({ affectedRows: 1 });
    mockIsBuilderSubscribed.mockResolvedValue(true);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      { user: { uid: "b1" }, params: { id: "1" }, body: { direction: "left" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "declined_by_builder" }),
    );
  });
});
