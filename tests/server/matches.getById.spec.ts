// tests/server/matches.getById.spec.ts
//
// Covers the GET-by-id endpoint /api/matches/:matchId. The original
// production-side regression: a JOIN on users for builder_uid INNER-
// joined the row out when the builder didn't have a users row (ghost
// trades created by the staging-only seed have a tradesmen row but
// no users row), so the homeowner's match page fetched a 404 and
// rendered "Match not found" even though the match was real.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const matchGetMount = require("../../server/routes/matches/get.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  matchGetMount(
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

describe("GET /api/matches/:matchId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authed", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler({ user: null, params: { matchId: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 400 for an invalid match id", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { matchId: "abc" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when no row matches the id + viewer", async () => {
    const q = vi.fn().mockResolvedValueOnce([]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { matchId: "5" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("loads a match where the builder is a ghost (no users row)", async () => {
    // Regression guard: ghost tradespeople have a tradesmen row but no
    // users row. The DB query must therefore LEFT JOIN users on the
    // builder side - an INNER JOIN drops the entire row. If anyone
    // changes the JOIN back to INNER, this test fails.
    const ghostUid = "ghost_abc123";
    const homeownerUid = "u_homeowner";
    const q = vi.fn().mockResolvedValueOnce([
      {
        id: 99,
        builder_uid: ghostUid,
        homeowner_uid: homeownerUid,
        project_id: 7,
        status: "matched",
        homeowner_swiped_at: new Date(),
        builder_swiped_at: new Date(),
        // NO builderFirstName / builderUserEmail - ghost has no users
        // row, so these are null in the LEFT JOIN result.
        builderFirstName: null,
        builderUserEmail: null,
        homeownerFirstName: "Chris",
        homeownerEmail: "chris@example.com",
        companyName: "Ghost Plumbing Ltd",
        builderPhone: "07931660810",
        builderTradeEmail: "fekova9815@deapad.com",
        builderPhotoUrl: "https://cdn/x.jpg",
      },
    ]);

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      { user: { uid: homeownerUid }, params: { matchId: "99" } },
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(404);
    const payload = res.json.mock.calls[0][0];
    expect(payload.match.status).toBe("matched");
    expect(payload.match.viewerIsBuilder).toBe(false);
    expect(payload.match.builderUid).toBe(ghostUid);
    // Falls back to the company name when builderFirstName is null -
    // the homeowner sees the ghost's persona (Ghost Plumbing Ltd),
    // not "Builder".
    expect(payload.match.builderName).toBe("Ghost Plumbing Ltd");
  });

  it("LEFT JOINs the builder users table so ghost rows survive the SELECT", () => {
    // Schema-level guard. The bug we're protecting against was a single
    // word ("JOIN" vs "LEFT JOIN") in the SQL. Asserting on the SQL
    // string directly catches the regression even if no test data is
    // shaped to exercise it.
    const q = vi.fn().mockResolvedValueOnce([]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    handler({ user: { uid: "u1" }, params: { matchId: "1" } }, res);
    const sql = String(q.mock.calls[0]?.[0] || "");
    // The builder side MUST be a LEFT JOIN. The homeowner side stays
    // an INNER JOIN since every row guarantees a users row there.
    expect(sql).toMatch(/LEFT JOIN\s+users\s+bu/i);
  });
});
