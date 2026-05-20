// tests/server/role-intent.post.spec.ts
//
// Pins POST /api/auth/role-intent. The route exists so that a user who
// starts a trader signup (Firebase-authed, no tradesman row yet) is
// stamped as a tradesman in user_roles immediately, instead of being
// displayed as a homeowner in /admin until they finish the wizard.
//
// Regression context: before this route, anyone who Firebase-authed
// and abandoned mid-wizard showed up in the admin user list as
// "Homeowner" because the classifier defaulted to the absence-of-
// tradesman-profile fallback.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const roleIntentPost = require("../../server/routes/auth/role-intent.post.js");

type Handler = (req: any, res: any) => Promise<void>;

function mountRoute(mysqlQuery: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    post: (_path: string, _auth: unknown, handler: Handler) => {
      captured = handler;
    },
  };
  const ctx = {
    auth: (_req: unknown, _res: unknown, next: any) => next(),
    mysqlQuery,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  roleIntentPost(fakeRouter, ctx);
  if (!captured) throw new Error("route handler was not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function captureCalls(): {
  mysqlQuery: any;
  calls: Array<{ sql: string; params?: unknown[] }>;
  setExistingRole(role: string | null): void;
} {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let existingRole: string | null = null;

  const mysqlQuery = vi.fn((sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const flat = sql.replace(/\s+/g, " ").trim();
    if (flat.startsWith("SELECT role FROM user_roles")) {
      return Promise.resolve(existingRole ? [{ role: existingRole }] : []);
    }
    return Promise.resolve({ affectedRows: 1 });
  });

  return {
    mysqlQuery,
    calls,
    setExistingRole(role: string | null) {
      existingRole = role;
    },
  };
}

describe("POST /api/auth/role-intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stamps role=tradesman for a fresh OAuth user with no prior role", async () => {
    const ctx = captureCalls();
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "uid-fresh" }, body: { role: "tradesman" } },
      res,
    );

    const insert = ctx.calls.find((c) =>
      c.sql.replace(/\s+/g, " ").includes("INSERT INTO user_roles"),
    );
    expect(insert).toBeDefined();
    expect(insert!.params).toEqual(["uid-fresh", "tradesman"]);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      role: "tradesman",
      changed: true,
    });
  });

  it("is idempotent - calling again with the same role doesn't re-insert", async () => {
    const ctx = captureCalls();
    ctx.setExistingRole("tradesman");
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "uid-already-trader" }, body: { role: "tradesman" } },
      res,
    );

    const insert = ctx.calls.find((c) =>
      c.sql.replace(/\s+/g, " ").includes("INSERT INTO user_roles"),
    );
    expect(insert).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      role: "tradesman",
      changed: false,
    });
  });

  it("never overwrites an existing admin role", async () => {
    const ctx = captureCalls();
    ctx.setExistingRole("admin");
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "uid-admin" }, body: { role: "tradesman" } },
      res,
    );

    const insert = ctx.calls.find((c) =>
      c.sql.replace(/\s+/g, " ").includes("INSERT INTO user_roles"),
    );
    expect(insert).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      role: "admin",
      changed: false,
    });
  });

  it("never downgrades a tradesman back to homeowner", async () => {
    const ctx = captureCalls();
    ctx.setExistingRole("tradesman");
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "uid-trader" }, body: { role: "homeowner" } },
      res,
    );

    const insert = ctx.calls.find((c) =>
      c.sql.replace(/\s+/g, " ").includes("INSERT INTO user_roles"),
    );
    expect(insert).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      role: "tradesman",
      changed: false,
    });
  });

  it("upgrades a homeowner -> tradesman when intent declares so", async () => {
    const ctx = captureCalls();
    ctx.setExistingRole("homeowner");
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "uid-upgrade" }, body: { role: "tradesman" } },
      res,
    );

    const insert = ctx.calls.find((c) =>
      c.sql.replace(/\s+/g, " ").includes("INSERT INTO user_roles"),
    );
    expect(insert).toBeDefined();
    expect(insert!.params).toEqual(["uid-upgrade", "tradesman"]);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      role: "tradesman",
      changed: true,
    });
  });

  it("rejects unknown roles with 400", async () => {
    const ctx = captureCalls();
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "uid-bad" }, body: { role: "wizard" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "invalid_role",
    });
  });

  it("requires an authenticated user (401 when uid missing)", async () => {
    const ctx = captureCalls();
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler({ user: {}, body: { role: "tradesman" } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Unauthorized",
    });
  });
});
