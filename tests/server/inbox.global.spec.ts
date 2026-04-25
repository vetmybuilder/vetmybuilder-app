import { describe, it, expect, vi, beforeEach } from "vitest";
import mountInbox from "../../server/routes/inbox.get";

function makeRouter() {
  const handlers: Record<string, any> = {};
  return {
    get(path: string, _auth: any, h: any) { handlers[path] = h; },
    _handlers: handlers,
  } as any;
}
function makeCtx(mysqlQuery: any) {
  return { auth: (_req: any, _res: any, next: any) => next(), mysqlQuery };
}

describe("GET /api/inbox", () => {
  let mysqlQuery: ReturnType<typeof vi.fn>;
  let handler: any;

  beforeEach(() => {
    mysqlQuery = vi.fn();
    const r = makeRouter();
    mountInbox(r, makeCtx(mysqlQuery));
    handler = (r as any)._handlers["/inbox"];
  });

  it("returns pitches across all of the caller's projects with status derived from flags", async () => {
    mysqlQuery.mockResolvedValueOnce([
      {
        messageId: "im1", projectId: "p1", projectTitle: "Kitchen extension",
        builderFirstName: "James", companyName: "Harrow",
        yearsTrading: 12, outward: "E4",
        body: "hello", hoursAgo: 2,
        dismissed_at: null, homeowner_replied_at: null,
      },
      {
        messageId: "im2", projectId: "p2", projectTitle: "Roof repair",
        builderFirstName: "Alan", companyName: "Lister",
        yearsTrading: 8, outward: "E17",
        body: "hi", hoursAgo: 24,
        dismissed_at: null, homeowner_replied_at: "2026-04-20",
      },
      {
        messageId: "im3", projectId: "p1", projectTitle: "Kitchen extension",
        builderFirstName: "Peter", companyName: "Ramsay",
        yearsTrading: 6, outward: "E4",
        body: "howdy", hoursAgo: 100,
        dismissed_at: "2026-04-19", homeowner_replied_at: null,
      },
    ]);

    const req = { user: { uid: "ho1" } };
    const res: any = { json: vi.fn(), status: vi.fn(function(this: any){return this;}) };
    await handler(req, res);

    const out = res.json.mock.calls[0][0];
    expect(out.pitches).toHaveLength(3);
    expect(out.pitches[0]).toMatchObject({
      messageId: "im1", projectId: "p1", projectTitle: "Kitchen extension",
      status: "new",
    });
    expect(out.pitches[1]).toMatchObject({ messageId: "im2", status: "replied" });
    expect(out.pitches[2]).toMatchObject({ messageId: "im3", status: "dismissed" });
    expect(out.unreadCount).toBe(1); // only "new" status counts as unread
  });

  it("returns empty list and zero count when homeowner has no pitches", async () => {
    mysqlQuery.mockResolvedValueOnce([]);
    const req = { user: { uid: "ho-empty" } };
    const res: any = { json: vi.fn(), status: vi.fn(function(this: any){return this;}) };
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith({ pitches: [], unreadCount: 0 });
  });

  it("returns 401-equivalent / early-exit if no uid on req.user", async () => {
    const req = { user: null };
    const res: any = { json: vi.fn(), status: vi.fn(function(this: any){return this;}) };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
