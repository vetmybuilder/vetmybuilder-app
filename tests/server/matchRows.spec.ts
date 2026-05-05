import { describe, it, expect, vi, beforeEach } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const matchRowsRoute = require("../../server/routes/projects/match-rows.get");

function makeRouter() {
  const routes: Record<string, any> = {};
  return {
    get(path: string, _auth: any, handler: any) {
      routes[path] = handler;
    },
    _handlers: routes,
  } as any;
}
function makeCtx(mysqlQuery: any) {
  return {
    auth: (_req: any, _res: any, next: any) => next(),
    mysqlQuery,
  };
}

describe("GET /api/projects/:id/match-rows", () => {
  let mysqlQuery: ReturnType<typeof vi.fn>;
  let handler: any;

  beforeEach(() => {
    mysqlQuery = vi.fn();
    const router = makeRouter();
    matchRowsRoute(router, makeCtx(mysqlQuery));
    handler = (router as any)._handlers["/projects/:id/match-rows"];
  });

  it("returns matches for owner with new/contacted/archived status derived from swipe_interest", async () => {
    // first query: ownership check
    mysqlQuery.mockResolvedValueOnce([{ id: "p1" }]);
    // second query: match rows
    mysqlQuery.mockResolvedValueOnce([
      {
        matchId: "si1",
        source: "recommended",
        status: "pending",
        builder_uid: "b1",
        companyName: "Harrow",
        trades: "Building,Plastering",
        builderFirstName: "James",
      },
      {
        matchId: "si2",
        source: "subscribed",
        status: "matched",
        builder_uid: "b2",
        companyName: "BP",
        trades: "Building",
        builderFirstName: "Mike",
      },
      {
        matchId: "si3",
        source: "ai",
        status: "declined_by_builder",
        builder_uid: "b3",
        companyName: "Lister",
        trades: "Roofing",
        builderFirstName: "Alan",
      },
    ]);
    const req = { params: { id: "p1" }, user: { uid: "ho1" } };
    const res: any = {
      json: vi.fn(),
      status: vi.fn(function (this: any) {
        return this;
      }),
    };
    await handler(req, res);
    const out = res.json.mock.calls[0][0];
    expect(out.matches).toHaveLength(3);
    expect(out.matches[0]).toMatchObject({
      source: "recommended",
      status: "new",
    });
    expect(out.matches[1]).toMatchObject({
      source: "ai-matched",
      status: "contacted",
    });
    expect(out.matches[2]).toMatchObject({
      source: "ai-matched",
      status: "archived",
    });
  });

  it("403s when caller doesn't own the project", async () => {
    mysqlQuery.mockResolvedValueOnce([]); // no ownership row
    const req = { params: { id: "p1" }, user: { uid: "ho1" } };
    const res: any = {
      status: vi.fn(function (this: any) {
        return this;
      }),
      json: vi.fn(),
    };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
