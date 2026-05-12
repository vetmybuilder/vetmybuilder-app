// tests/server/adminTradesmanPhotos.spec.ts
//
// Unit specs for GET /api/admin/tradesmen/:uid/photos - the lazy-load
// endpoint behind the drawer's Photos tab.

import { describe, it, expect, vi, beforeEach } from "vitest";
import mount from "../../server/routes/admin/tradesman-photos.get";

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
    // The route uses requireAdmin(ctx); pass a stub admin guard.
    isAdmin: async () => true,
  } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("GET /api/admin/tradesmen/:uid/photos", () => {
  let mysqlQuery: ReturnType<typeof vi.fn>;
  let handler: any;

  beforeEach(() => {
    mysqlQuery = vi.fn();
    const r = makeRouter();
    mount(r, makeCtx(mysqlQuery));
    handler = (r as any)._handlers["/admin/tradesmen/:uid/photos"];
  });

  it("400s on missing uid param", async () => {
    const res = makeRes();
    await handler({ user: { uid: "admin" }, params: { uid: "" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "missing_uid" }),
    );
  });

  it("returns photos ordered by sort_order then created_at", async () => {
    mysqlQuery.mockResolvedValueOnce([
      { id: 11, url: "/uploads/a.jpg", sortOrder: 0, createdAt: "2026-01-01" },
      { id: 12, url: "/uploads/b.jpg", sortOrder: 1, createdAt: "2026-01-02" },
    ]);
    const res = makeRes();
    await handler(
      { user: { uid: "admin" }, params: { uid: "u-1" } },
      res,
    );
    expect(mysqlQuery).toHaveBeenCalledWith(
      expect.stringMatching(/FROM tradesmen_photos[\s\S]+WHERE tradesman_user_id = \?/),
      ["u-1"],
    );
    expect(res.json).toHaveBeenCalledWith({
      photos: [
        { id: 11, url: "/uploads/a.jpg", sortOrder: 0, createdAt: "2026-01-01" },
        { id: 12, url: "/uploads/b.jpg", sortOrder: 1, createdAt: "2026-01-02" },
      ],
    });
  });

  it("returns an empty array when the tradesman has no photos", async () => {
    mysqlQuery.mockResolvedValueOnce([]);
    const res = makeRes();
    await handler(
      { user: { uid: "admin" }, params: { uid: "u-2" } },
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ photos: [] });
  });

  it("500s on a DB error rather than leaking the message", async () => {
    mysqlQuery.mockRejectedValueOnce(new Error("connection refused"));
    const res = makeRes();
    await handler(
      { user: { uid: "admin" }, params: { uid: "u-3" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "fetch_failed" }),
    );
  });
});
