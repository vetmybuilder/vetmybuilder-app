// tests/server/notificationsDismiss.spec.ts
//
// Covers the Inbox "Activity tab clear-all + per-row dismiss" flow:
//   - DELETE  /api/notifications/:id   → soft-deletes (stamps dismissed_at)
//   - POST    /api/notifications/dismiss-all
//   - GET     /api/notifications       → filters dismissed rows out
//
// All purely unit-level: we capture the route handler with a fake
// `router`, hand it a mocked `mysqlQuery`, and assert on the SQL we
// see + the JSON response.

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
  method: "get" | "post" | "delete",
) {
  let handler: any = null;
  const router: any = {
    [method]: (_path: string, ...fns: any[]) => {
      handler = fns[fns.length - 1];
    },
  };
  mountFn(router, ctx);
  if (!handler) throw new Error(`no ${method} handler captured`);
  return handler;
}

describe("notifications · dismiss flow", () => {
  describe("DELETE /api/notifications/:id (soft delete)", () => {
    it("UPDATEs dismissed_at on the targeted row and returns ok", async () => {
      const mysqlQuery = vi
        .fn()
        // 1st call: ownership SELECT
        .mockResolvedValueOnce([{ userId: "u1" }])
        // 2nd call: UPDATE
        .mockResolvedValueOnce(undefined);

      const handler = captureRoute(
        require("../../server/routes/notifications/notification.delete.js"),
        { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
        "delete",
      );

      const res = mockRes();
      await handler(
        { params: { id: "42" }, user: { uid: "u1" } },
        res,
      );

      expect(res.json).toHaveBeenCalledWith({ ok: true });
      // Second call MUST be the UPDATE - i.e. soft delete, not DELETE FROM.
      const updateCall = mysqlQuery.mock.calls[1];
      expect(updateCall[0]).toMatch(/UPDATE\s+notifications/i);
      expect(updateCall[0]).toMatch(/SET\s+dismissed_at\s*=\s*NOW\(\)/i);
      expect(updateCall[0]).not.toMatch(/^\s*DELETE\s+FROM/i);
      expect(updateCall[1]).toEqual([42]);
    });

    it("refuses to dismiss a notification belonging to another user", async () => {
      const mysqlQuery = vi
        .fn()
        .mockResolvedValueOnce([{ userId: "someone-else" }]);

      const handler = captureRoute(
        require("../../server/routes/notifications/notification.delete.js"),
        { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
        "delete",
      );

      const res = mockRes();
      await handler(
        { params: { id: "42" }, user: { uid: "u1" } },
        res,
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mysqlQuery).toHaveBeenCalledTimes(1); // No UPDATE fired
    });
  });

  describe("POST /api/notifications/dismiss-all", () => {
    it("stamps dismissed_at on every undismissed notification for the user", async () => {
      const mysqlQuery = vi
        .fn()
        .mockResolvedValueOnce({ affectedRows: 7 });

      const handler = captureRoute(
        require("../../server/routes/notifications/dismiss-all.post.js"),
        { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
        "post",
      );

      const res = mockRes();
      await handler({ user: { uid: "u1" } }, res);

      expect(res.json).toHaveBeenCalledWith({ ok: true, affected: 7 });
      const [sql, params] = mysqlQuery.mock.calls[0];
      expect(sql).toMatch(/UPDATE\s+notifications/i);
      expect(sql).toMatch(/SET\s+dismissed_at\s*=\s*NOW\(\)/i);
      // Idempotency clause - don't re-stamp rows we already dismissed.
      expect(sql).toMatch(/dismissed_at\s+IS\s+NULL/i);
      expect(params).toEqual(["u1"]);
    });

    it("returns 401 when the caller has no uid", async () => {
      const handler = captureRoute(
        require("../../server/routes/notifications/dismiss-all.post.js"),
        { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery: vi.fn() },
        "post",
      );

      const res = mockRes();
      await handler({ user: {} }, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("GET /api/notifications (filter dismissed)", () => {
    it("filters out dismissed_at IS NOT NULL rows on both items and unread queries", async () => {
      const mysqlQuery = vi
        .fn()
        // 1st: items
        .mockResolvedValueOnce([])
        // 2nd: unread count
        .mockResolvedValueOnce([{ c: 0 }]);

      const handler = captureRoute(
        require("../../server/routes/notifications/notifications.get.js"),
        { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
        "get",
      );

      const res = mockRes();
      await handler(
        { user: { uid: "u1" }, query: {} },
        res,
      );

      // Every SQL we ran must include the dismissed_at IS NULL clause.
      // Otherwise dismissed rows would still surface in the inbox.
      for (const [sql] of mysqlQuery.mock.calls) {
        expect(sql).toMatch(/dismissed_at\s+IS\s+NULL/i);
      }
    });
  });
});
