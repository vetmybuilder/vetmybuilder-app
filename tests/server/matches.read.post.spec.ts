// tests/server/matches.read.post.spec.ts
//
// Regression coverage for POST /api/matches/:id/read — the per-thread
// read endpoint that the messaging dock calls when it opens a chat
// window. Without this endpoint the unread badge persists on the
// Messages icon even after the user has the conversation open on
// screen, because the bulk /api/matches/read-all is too broad to fire
// per dock open.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/matches/read.post.js");

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

describe("POST /api/matches/:id/read", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps *_last_read_at on the single swipe_interest row for the caller", async () => {
    // First call: lookup ghost personas (empty for a non-master user).
    // Second call: the UPDATE.
    const q = vi
      .fn()
      .mockResolvedValueOnce([]) // no ghosts
      .mockResolvedValueOnce({ affectedRows: 1 });
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      logActivity: vi.fn(),
    });
    const res = mockRes();
    await handler(
      { user: { uid: "u1" }, params: { id: "42" } },
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ ok: true, affected: 1 });

    // The UPDATE must target the single id and gate on the caller
    // (or any of their ghost personas) being on either side of the row.
    const update = q.mock.calls[1];
    expect(update[0]).toMatch(/UPDATE\s+swipe_interest/i);
    expect(update[0]).toMatch(/WHERE\s+id\s*=\s*\?/i);
    expect(update[0]).toMatch(/homeowner_uid\s+IN\s*\(/i);
    expect(update[0]).toMatch(/builder_uid\s+IN\s*\(/i);
  });

  // Regression: master-operator must be able to mark a ghost-owned
  // thread as read. The endpoint expands the WHERE clause via a
  // selfUids set (caller + ghost personas) so a master clicking on a
  // ghost's chat dock actually stamps builder_last_read_at on that
  // row.
  it("includes ghost personas in the WHERE clause when the caller is a master operator", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([
        { user_id: "ghost_aaa" },
        { user_id: "ghost_bbb" },
      ])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      { user: { uid: "master1" }, params: { id: "42" } },
      res,
    );

    const update = q.mock.calls[1];
    // The IN list inside the WHERE clause should include the master's
    // uid AND both ghost uids. We check by inspecting the bound
    // params — the last 3 params are the WHERE clause's
    // homeowner_uid IN (selfUids), and similarly for builder_uid.
    // Total bind order: [self×N for homeowner SET, self×N for builder
    // SET, matchId, self×N for homeowner WHERE, self×N for builder
    // WHERE]. For N=3 that's 3+3+1+3+3 = 13 params.
    expect(update[1].length).toBe(13);
    expect(update[1]).toContain("master1");
    expect(update[1]).toContain("ghost_aaa");
    expect(update[1]).toContain("ghost_bbb");
  });

  it("returns 404 when the row doesn't exist or the caller isn't on either side", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([]) // ghost lookup
      .mockResolvedValueOnce({ affectedRows: 0 }); // no rows matched
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      { user: { uid: "u1" }, params: { id: "99" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 for invalid match id", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler(
      { user: { uid: "u1" }, params: { id: "not-a-number" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 401 when caller is not authenticated", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler(
      { user: null, params: { id: "42" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
