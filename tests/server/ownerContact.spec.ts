import { describe, it, expect, vi } from "vitest";

// The owner-contact endpoint determines whether a tradesperson can see
// homeowner contact details. We test the gating logic by mocking mysqlQuery.

// Import the route factory
const routeFactory = require("../../server/routes/projects/owner-contact.get.js");

function createMockRouter() {
  const handlers: Record<string, Function> = {};
  return {
    get: (path: string, ...args: any[]) => {
      // Last arg is the handler, second-to-last is auth middleware
      handlers[path] = args[args.length - 1];
    },
    handlers,
  };
}

function createMockCtx(overrides: Record<string, any> = {}) {
  return {
    auth: (_req: any, _res: any, next: Function) => next(),
    mysqlQuery: overrides.mysqlQuery || vi.fn(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

function createReq(uid: string, projectId: number) {
  return {
    user: { uid },
    params: { id: String(projectId) },
    headers: {},
    get: () => null,
  };
}

function createRes() {
  const res: any = { _status: 200, _json: null };
  res.status = (code: number) => { res._status = code; return res; };
  res.json = (data: any) => { res._json = data; return res; };
  return res;
}

describe("GET /projects/:id/owner-contact (gating logic)", () => {
  // Helper to register route and get handler
  function setup(queryMock: Function) {
    const router = createMockRouter();
    const ctx = createMockCtx({ mysqlQuery: queryMock });
    routeFactory(router, ctx);
    return router.handlers["/projects/:id/owner-contact"];
  }

  function mockQuery(data: Record<string, any[]>) {
    return vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
      if (/FROM projects/i.test(sql)) return data.project || [{ id: 1, ownerUserId: "owner-1", status: "live" }];
      if (/FROM tradesmen/i.test(sql)) return data.tradesman || [{ plan: "free", subscription_status: "inactive", verification_status: "approved" }];
      if (/FROM project_contact_unlocks/i.test(sql)) return data.unlocks || [];
      if (/FROM recommendations/i.test(sql)) return data.recs || [];
      if (/FROM users/i.test(sql)) return data.owner || [{ firstName: "Test", lastName: "Owner", email: "owner@test.com" }];
      return [];
    });
  }

  it("blocks unauthenticated requests", async () => {
    const handler = setup(vi.fn());
    const req = { user: null, params: { id: "1" }, headers: {}, get: () => null };
    const res = createRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns unlocked for recommended tradespeople (payments disabled)", async () => {
    const handler = setup(mockQuery({
      recs: [{ id: 1 }], // tradesman is recommended
    }));
    const req = createReq("tradesman-1", 1);
    const res = createRes();
    await handler(req, res);
    expect(res._json?.unlocked).toBe(true);
    expect(res._json?.state).toBe("unlocked_recommended");
  });

  it("returns locked for non-recommended tradespeople (payments disabled)", async () => {
    const handler = setup(mockQuery({
      recs: [], // not recommended
    }));
    const req = createReq("tradesman-1", 1);
    const res = createRes();
    await handler(req, res);
    expect(res._json?.unlocked).toBe(false);
    expect(res._json?.error).toBe("not_unlocked");
  });

  it("returns unlocked for non-recommended tradesperson with active unlock", async () => {
    const handler = setup(mockQuery({
      recs: [],
      unlocks: [{ status: "active" }],
    }));
    const req = createReq("tradesman-1", 1);
    const res = createRes();
    await handler(req, res);
    expect(res._json?.unlocked).toBe(true);
    expect(res._json?.state).toBe("unlocked_one_off");
  });

  it("blocks unverified tradespeople regardless of recommendation", async () => {
    const handler = setup(mockQuery({
      tradesman: [{ plan: "free", subscription_status: "inactive", verification_status: "unverified" }],
      recs: [{ id: 1 }],
    }));
    const req = createReq("tradesman-1", 1);
    const res = createRes();
    await handler(req, res);
    expect(res._json?.unlocked).toBe(false);
    expect(res._json?.error).toBe("verification_required");
  });

  it("blocks when verification is pending", async () => {
    const handler = setup(mockQuery({
      tradesman: [{ plan: "free", subscription_status: "inactive", verification_status: "pending" }],
    }));
    const req = createReq("tradesman-1", 1);
    const res = createRes();
    await handler(req, res);
    expect(res._json?.unlocked).toBe(false);
    expect(res._json?.error).toBe("verification_pending");
  });

  it("blocks owner from requesting their own contact", async () => {
    const handler = setup(mockQuery({}));
    const req = createReq("owner-1", 1); // same as project owner
    const res = createRes();
    await handler(req, res);
    expect(res._json?.unlocked).toBe(false);
    expect(res._json?.error).toBe("owner_cannot_request_own_contact");
  });

  it("returns 404 for non-existent project", async () => {
    const handler = setup(mockQuery({ project: [] }));
    const req = createReq("tradesman-1", 999);
    const res = createRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("blocks when project is not live", async () => {
    const handler = setup(mockQuery({
      project: [{ id: 1, ownerUserId: "owner-1", status: "archived" }],
    }));
    const req = createReq("tradesman-1", 1);
    const res = createRes();
    await handler(req, res);
    expect(res._json?.unlocked).toBe(false);
    expect(res._json?.error).toBe("project_not_live");
  });
});
