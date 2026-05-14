// tests/server/matchesReadAll.spec.ts
//
// Covers POST /api/matches/read-all - the "Mark all as read" action on
// the Inbox Messages tab. The route stamps homeowner_last_read_at OR
// builder_last_read_at depending on which side of the swipe_interest
// row the caller is on, in a single CASE-based UPDATE.

import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function captureRoute(
  mountFn: (router: any, ctx: any) => void,
  ctx: any,
) {
  let handler: any = null;
  const router: any = {
    post: (_p: string, ...fns: any[]) => {
      handler = fns[fns.length - 1];
    },
  };
  mountFn(router, ctx);
  if (!handler) throw new Error("no POST handler captured");
  return handler;
}

describe("POST /api/matches/read-all", () => {
  it("stamps homeowner_last_read_at for matches where the caller is the homeowner and builder_last_read_at where they're the builder", async () => {
    const mysqlQuery = vi.fn().mockResolvedValueOnce({ affectedRows: 3 });

    const handler = captureRoute(
      require("../../server/routes/matches/read-all.post.js"),
      { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
    );

    const res = mockRes();
    await handler({ user: { uid: "u-1" } }, res);

    expect(res.json).toHaveBeenCalledWith({ ok: true, affected: 3 });

    const [sql, params] = mysqlQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE\s+swipe_interest/i);
    // Per-side stamps. The CASE expressions guarantee a homeowner uid
    // can never accidentally write to the builder column or vice versa.
    expect(sql).toMatch(/homeowner_last_read_at\s*=/i);
    expect(sql).toMatch(/builder_last_read_at\s*=/i);
    expect(sql).toMatch(/CASE\s+WHEN\s+homeowner_uid\s*=\s*\?\s+THEN\s+NOW\(\)/i);
    expect(sql).toMatch(/CASE\s+WHEN\s+builder_uid\s*=\s*\?\s+THEN\s+NOW\(\)/i);
    expect(sql).toMatch(/WHERE\s+homeowner_uid\s*=\s*\?\s+OR\s+builder_uid\s*=\s*\?/i);
    // Same uid in every placeholder - the route reuses the caller uid
    // for all four bindings.
    expect(params).toEqual(["u-1", "u-1", "u-1", "u-1"]);
  });

  it("returns 401 when the caller has no uid", async () => {
    const handler = captureRoute(
      require("../../server/routes/matches/read-all.post.js"),
      { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery: vi.fn() },
    );

    const res = mockRes();
    await handler({ user: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("surfaces a 500 when the UPDATE throws", async () => {
    const mysqlQuery = vi.fn().mockRejectedValueOnce(new Error("db down"));

    const handler = captureRoute(
      require("../../server/routes/matches/read-all.post.js"),
      { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
    );

    const res = mockRes();
    await handler({ user: { uid: "u-1" } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
