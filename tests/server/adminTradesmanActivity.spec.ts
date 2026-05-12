// tests/server/adminTradesmanActivity.spec.ts
//
// Unit specs for GET /api/admin/tradesmen/:uid/activity - the audit
// log feed that powers the drawer's Activity tab.

import { describe, it, expect, vi, beforeEach } from "vitest";
import mount from "../../server/routes/admin/tradesman-activity.get";

function makeRouter() {
  const handlers: Record<string, any> = {};
  return {
    get(path: string, ...rest: any[]) {
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
  } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("GET /api/admin/tradesmen/:uid/activity", () => {
  let mysqlQuery: ReturnType<typeof vi.fn>;
  let handler: any;

  beforeEach(() => {
    mysqlQuery = vi.fn();
    const r = makeRouter();
    mount(r, makeCtx(mysqlQuery));
    handler = (r as any)._handlers["/admin/tradesmen/:uid/activity"];
  });

  it("400s on missing uid", async () => {
    const res = makeRes();
    await handler({ user: { uid: "admin" }, params: { uid: "" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns audit events newest-first plus the profile timestamps", async () => {
    // First call: audit rows. Second call: profile row.
    mysqlQuery.mockResolvedValueOnce([
      {
        id: 22,
        actorUid: "admin-1",
        action: "status_change",
        detailsJson: JSON.stringify({ status: "inactive" }),
        createdAt: "2026-05-12T12:00:00Z",
      },
      {
        id: 21,
        actorUid: "admin-1",
        action: "doc_verify",
        detailsJson: JSON.stringify({ docIdx: 0, docLabel: "Public liability" }),
        createdAt: "2026-05-11T09:00:00Z",
      },
    ]);
    mysqlQuery.mockResolvedValueOnce([
      { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-05-12T12:00:00Z" },
    ]);

    const res = makeRes();
    await handler(
      { user: { uid: "admin" }, params: { uid: "u-1" } },
      res,
    );

    expect(res.json).toHaveBeenCalledWith({
      events: [
        {
          id: 22,
          actorUid: "admin-1",
          action: "status_change",
          details: { status: "inactive" },
          createdAt: "2026-05-12T12:00:00Z",
        },
        {
          id: 21,
          actorUid: "admin-1",
          action: "doc_verify",
          details: { docIdx: 0, docLabel: "Public liability" },
          createdAt: "2026-05-11T09:00:00Z",
        },
      ],
      profile: {
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-05-12T12:00:00Z",
      },
    });
  });

  it("returns empty events + null profile when nothing is found", async () => {
    mysqlQuery.mockResolvedValueOnce([]);
    mysqlQuery.mockResolvedValueOnce([]);

    const res = makeRes();
    await handler(
      { user: { uid: "admin" }, params: { uid: "u-2" } },
      res,
    );

    expect(res.json).toHaveBeenCalledWith({
      events: [],
      profile: { createdAt: null, updatedAt: null },
    });
  });

  it("tolerates malformed details_json gracefully", async () => {
    mysqlQuery.mockResolvedValueOnce([
      {
        id: 33,
        actorUid: "admin-1",
        action: "status_change",
        detailsJson: "{not valid json",
        createdAt: "2026-05-12T12:00:00Z",
      },
    ]);
    mysqlQuery.mockResolvedValueOnce([
      { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-05-12T12:00:00Z" },
    ]);

    const res = makeRes();
    await handler(
      { user: { uid: "admin" }, params: { uid: "u-3" } },
      res,
    );

    const body = (res.json as any).mock.calls[0][0];
    expect(body.events[0].details).toBeNull();
  });
});
