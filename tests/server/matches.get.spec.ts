import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const matchesMount = require("../../server/routes/projects/matches.get.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  matchesMount(
    { get: (_p: string, _a: any, h: any) => { captured = h; } },
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

describe("GET /api/projects/:id/matches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authed", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler({ user: null, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 403 when the user is not the project owner", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE
      .mockResolvedValueOnce([
        { id: 1, ownerUserId: "someone-else", location: "E4 7ER" },
      ]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns split deck (recommended + subscribed) excluding swiped pairs", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE
      .mockResolvedValueOnce([
        { id: 1, ownerUserId: "u1", location: "E4 7ER" },
      ]) // project
      .mockResolvedValueOnce([
        {
          structured: JSON.stringify({
            type: "kitchen",
            recommended_trades: ["kitchen_fitter"],
            price_band_estimate: "5000-10000",
          }),
        },
      ]) // classification
      .mockResolvedValueOnce([{ builder_uid: "already-swiped" }]) // swiped exclusion
      .mockResolvedValueOnce([
        {
          user_id: "rec1",
          company_name: "Rec Co",
          trade_types: "kitchen_fitter,plumber",
          service_areas: "E4,E10",
          vmb_score: 50,
        },
      ]) // recommendations
      .mockResolvedValueOnce([
        {
          user_id: "sub1",
          company_name: "Sub Co",
          trade_types: "kitchen_fitter",
          service_areas: "E4",
          vmb_score: 60,
        },
      ]); // subscribed pool
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.recommended).toHaveLength(1);
    expect(body.recommended[0].uid).toBe("rec1");
    expect(body.recommended[0].displayName).toBe("Rec Co");
    expect(body.recommended[0].primaryTrade).toBe("kitchen_fitter");
    expect(body.recommended[0].secondaryTrades).toEqual(["plumber"]);
    expect(body.recommended[0].serviceAreas).toEqual(["E4", "E10"]);
    expect(body.subscribed).toHaveLength(1);
    expect(body.subscribed[0].uid).toBe("sub1");
  });
});
