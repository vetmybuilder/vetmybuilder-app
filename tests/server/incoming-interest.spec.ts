import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/tradesmen/incoming-interest.get.js");

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

describe("GET /api/tradesmen/me/incoming-interest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authed", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler({ user: null }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns only pending rows for this builder", async () => {
    const q = vi
      .fn()
      // expireSwipeInterests fires two UPDATEs now (standard 14-day pass
      // + paid_unlock boost-expiry pass) before the rows fetch.
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE 1 (standard)
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE 2 (paid_unlock)
      .mockResolvedValueOnce([
        {
          id: 10,
          project_id: 1,
          homeowner_uid: "h1",
          source: "subscribed",
          homeowner_swiped_at: new Date(),
          project_title: "Kitchen refit",
          description: "New kitchen",
          location: "Chingford E4 7ER",
          price_band: null,
          homeowner_firstname: "Chris",
        },
      ]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "b1" } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: 10,
      projectId: 1,
      source: "subscribed",
      // Pre-match: server hides the homeowner's name and reduces the
      // project location to its outward postcode only.
      homeownerFirstName: null,
    });
    expect(body.items[0].project.title).toBe("Kitchen refit");
    expect(body.items[0].project.location).toBe("E4");
  });
});
