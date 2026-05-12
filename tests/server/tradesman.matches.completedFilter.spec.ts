// tests/server/tradesman.matches.completedFilter.spec.ts
//
// Mirror of the homeowner-side regression guard: the tradesperson inbox
// must also drop match rows for completed projects, so both sides see the
// same closed conversations disappear.

import { describe, it, expect, vi, beforeEach } from "vitest";
import mountTradesmanMatches from "../../server/routes/tradesman/matches.get";

function makeRouter() {
  const handlers: Record<string, any> = {};
  return {
    get(path: string, _auth: any, h: any) {
      handlers[path] = h;
    },
    _handlers: handlers,
  } as any;
}

describe("GET /api/tradesman/matches - completed-project filter", () => {
  let mysqlQuery: ReturnType<typeof vi.fn>;
  let capturedMainSql = "";
  let handler: any;

  beforeEach(() => {
    capturedMainSql = "";
    mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM swipe_interest si/.test(sql) && !capturedMainSql) {
        capturedMainSql = sql;
      }
      return [];
    });

    const r = makeRouter();
    mountTradesmanMatches(r, {
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery,
    } as any);
    handler = (r as any)._handlers["/tradesman/matches"];
  });

  it("includes the AND p.status <> 'completed' clause in the main SELECT", async () => {
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    await handler({ user: { uid: "trade-1" } }, res);

    expect(capturedMainSql).not.toBe("");
    expect(capturedMainSql).toMatch(/p\.status\s*<>\s*'completed'/);
  });
});
