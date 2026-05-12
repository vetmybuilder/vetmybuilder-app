// tests/server/leaderboard.sort.spec.ts
//
// Regression guard for the leaderboard sort allowlist. The handler must:
//   - Default to score ordering (vmb_score DESC) when no `sort` param.
//   - Apply the matching ORDER BY for each allowlisted key.
//   - Fall back to the default for unknown / hostile values - never
//     interpolate a raw param into ORDER BY.
//
// We capture the SQL string that hits the main FETCH query (the one
// with the LIMIT/OFFSET) and assert the leading ORDER BY column matches
// expectations.

import { describe, it, expect, vi, beforeEach } from "vitest";
import mountLeaderboard from "../../server/routes/tradesmen/leaderboard.get";

function makeRouter() {
  const handlers: Record<string, any> = {};
  return {
    get(path: string, ...rest: any[]) {
      // The leaderboard route is mounted as `router.get(path, ...middleware, handler)`.
      // Capture the final fn as the handler.
      handlers[path] = rest[rest.length - 1];
    },
    _handlers: handlers,
  } as any;
}

function makeCtx(mysqlQuery: any) {
  return {
    auth: (_req: any, _res: any, next: any) => next(),
    mysqlQuery,
    isAdmin: async () => true,
    extractLocationTokens: () => ({}),
  } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function setup(sort?: string) {
  // Capture every SQL string the handler runs so we can inspect the
  // main FETCH (the one with LIMIT/OFFSET) for the ORDER BY clause.
  const sqls: string[] = [];
  const mysqlQuery = vi.fn(async (sql: string) => {
    sqls.push(sql);
    // The handler gates on isAdmin(), which queries user_roles. Return
    // role=admin so the handler runs through to the FETCH query we're
    // asserting on.
    if (/FROM user_roles/.test(sql)) {
      return [{ role: "admin" }];
    }
    if (/COUNT\(\*\) AS c FROM tradesmen/.test(sql)) {
      return [{ c: 0 }];
    }
    return [];
  });

  const r = makeRouter();
  mountLeaderboard(r, makeCtx(mysqlQuery));
  const handler = (r as any)._handlers["/tradesmen/leaderboard"];
  return { sqls, handler };
}

function fetchSql(sqls: string[]): string {
  // The fetch query is the one with both LIMIT and OFFSET.
  return (
    sqls.find((s) => /LIMIT\s+\d+\s+OFFSET\s+\d+/.test(s)) || ""
  );
}

describe("GET /api/tradesmen/leaderboard - sort allowlist", () => {
  let res: any;
  beforeEach(() => {
    res = makeRes();
  });

  it("defaults to vmb_score ordering when no sort param is supplied", async () => {
    const { sqls, handler } = setup();
    await handler({ user: { uid: "admin" }, query: {} }, res);
    expect(fetchSql(sqls)).toMatch(/ORDER BY\s+t\.vmb_score DESC/);
  });

  it("sort=recent orders by updated_at first", async () => {
    const { sqls, handler } = setup();
    await handler(
      { user: { uid: "admin" }, query: { sort: "recent" } },
      res,
    );
    expect(fetchSql(sqls)).toMatch(/ORDER BY\s+t\.updated_at DESC/);
  });

  it("sort=photos orders by photo_count first", async () => {
    const { sqls, handler } = setup();
    await handler(
      { user: { uid: "admin" }, query: { sort: "photos" } },
      res,
    );
    expect(fetchSql(sqls)).toMatch(/ORDER BY\s+COALESCE\(t\.photo_count, 0\) DESC/);
  });

  it("falls back to score for an unknown sort key without leaking it into SQL", async () => {
    const { sqls, handler } = setup();
    // A typo'd / hostile sort value must never reach the ORDER BY. The
    // handler should silently default to score ordering.
    await handler(
      {
        user: { uid: "admin" },
        query: { sort: "id; DROP TABLE tradesmen;--" },
      },
      res,
    );
    const sql = fetchSql(sqls);
    expect(sql).toMatch(/ORDER BY\s+t\.vmb_score DESC/);
    expect(sql).not.toContain("DROP TABLE");
  });
});
