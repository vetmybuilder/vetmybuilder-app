// tests/server/role-intent.delete.spec.ts
//
// Pins DELETE /api/auth/role-intent. The endpoint exists so a trader
// who bails out of /tradesman/signup/complete via the X button (or
// the back arrow on step 1) doesn't leave a permanent
// "tradesman (pending)" row in user_roles. The wizard handler calls
// this after fetching the user's session cookie.
//
// Safety contract that's pinned here:
//   - Only deletes user_roles when role == 'tradesman'. Admin rows
//     and homeowner rows are never touched.
//   - Only deletes the users row when no tradesmen profile AND no
//     project ownership exists. Once the trader has saved anything
//     real, the row stays and admin can tidy up manually.
//   - Returns 401 if the request isn't authenticated.

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
const roleIntentDelete = require("../../server/routes/auth/role-intent.delete.js");

type Handler = (req: any, res: any) => Promise<void>;

function mountRoute(mysqlQuery: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    delete: (_path: string, _auth: unknown, handler: Handler) => {
      captured = handler;
    },
  };
  const ctx = {
    auth: (_req: unknown, _res: unknown, next: any) => next(),
    mysqlQuery,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  roleIntentDelete(fakeRouter, ctx);
  if (!captured) throw new Error("role-intent delete handler was not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// Builds a stateful mysqlQuery stub that lets each test configure the
// "has profile" and "has projects" lookups, and captures all DELETE
// statements that ran so assertions can confirm what was/wasn't touched.
function makeMysqlStub({
  hasProfile,
  hasProjects,
}: {
  hasProfile: boolean;
  hasProjects: boolean;
}) {
  const deletes: Array<{ sql: string; params?: unknown[] }> = [];

  const mysqlQuery = vi.fn((sql: string, params?: unknown[]) => {
    const flat = sql.replace(/\s+/g, " ").trim();

    if (flat.startsWith("SELECT 1 FROM tradesmen")) {
      return Promise.resolve(hasProfile ? [{ "1": 1 }] : []);
    }
    if (flat.startsWith("SELECT 1 FROM projects")) {
      return Promise.resolve(hasProjects ? [{ "1": 1 }] : []);
    }
    if (flat.startsWith("DELETE FROM")) {
      deletes.push({ sql: flat, params });
      return Promise.resolve({ affectedRows: 1 });
    }
    return Promise.resolve([]);
  });

  return { mysqlQuery, deletes };
}

describe("DELETE /api/auth/role-intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the trade role-intent and the ghost users row for a fully-bailed signup", async () => {
    const ctx = makeMysqlStub({ hasProfile: false, hasProjects: false });
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler({ user: { uid: "uid-pending" } }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        cleared: true,
        userRowDeleted: true,
      }),
    );

    const targets = ctx.deletes.map((d) => d.sql);
    expect(
      targets.some((s) =>
        /DELETE FROM user_roles.* role = 'tradesman'/i.test(s),
      ),
    ).toBe(true);
    expect(targets.some((s) => /DELETE FROM users/i.test(s))).toBe(true);
  });

  it("refuses to touch anything if the user already has a tradesmen profile", async () => {
    const ctx = makeMysqlStub({ hasProfile: true, hasProjects: false });
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler({ user: { uid: "uid-real-trader" } }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        cleared: false,
        reason: "has_profile",
      }),
    );
    expect(ctx.deletes).toHaveLength(0);
  });

  it("clears the role but keeps the users row when the user owns projects", async () => {
    const ctx = makeMysqlStub({ hasProfile: false, hasProjects: true });
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler({ user: { uid: "uid-homeowner-who-tried-trade" } }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        cleared: true,
        userRowDeleted: false,
        hasProjects: true,
      }),
    );

    const targets = ctx.deletes.map((d) => d.sql);
    expect(
      targets.some((s) =>
        /DELETE FROM user_roles.* role = 'tradesman'/i.test(s),
      ),
    ).toBe(true);
    expect(targets.some((s) => /DELETE FROM users/i.test(s))).toBe(false);
  });

  it("returns 401 when the request isn't authenticated", async () => {
    const ctx = makeMysqlStub({ hasProfile: false, hasProjects: false });
    const handler = mountRoute(ctx.mysqlQuery);
    const res = mockRes();

    await handler({ user: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Unauthorized",
    });
    expect(ctx.deletes).toHaveLength(0);
  });
});
