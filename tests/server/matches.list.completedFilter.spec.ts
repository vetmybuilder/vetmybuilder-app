// tests/server/matches.list.completedFilter.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import mountMatches from "../../server/routes/matches/list.get";

function makeRouter() {
  const handlers: Record<string, any> = {};
  return {
    get(path: string, _auth: any, h: any) {
      handlers[path] = h;
    },
    _handlers: handlers,
  } as any;
}

describe("GET /api/matches - completed-project filter", () => {
  let mysqlQuery: ReturnType<typeof vi.fn>;
  let capturedMainSql = "";
  let handler: any;

  beforeEach(() => {
    capturedMainSql = "";
    mysqlQuery = vi.fn(async (sql: string) => {
      // The first call is the main matches SELECT. Capture its SQL so we
      // can assert the filter clause is intact. Subsequent calls (recs
      // lookup, last-message, unread) get empty rows so the handler runs
      // to completion without errors.
      if (/FROM swipe_interest si/.test(sql) && !capturedMainSql) {
        capturedMainSql = sql;
      }
      return [];
    });

    const r = makeRouter();
    mountMatches(r, {
      auth: (_req: any, _res: any, next: any) => next(),
      mysqlQuery,
    } as any);
    handler = (r as any)._handlers["/matches"];
  });

  it("includes the AND p.status <> 'completed' clause in the main SELECT", async () => {
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    await handler({ user: { uid: "u1" } }, res);

    expect(capturedMainSql).not.toBe("");
    // The filter must appear in the WHERE clause. We assert the exact
    // textual form rather than just "p.status" because someone could
    // narrow it to ENUM('archived') and that would be a regression too.
    expect(capturedMainSql).toMatch(/p\.status\s*<>\s*'completed'/);
  });
});
