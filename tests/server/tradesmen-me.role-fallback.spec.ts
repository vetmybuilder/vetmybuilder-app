// tests/server/tradesmen-me.role-fallback.spec.ts
//
// Pins the role fallback in GET /api/tradesmen/me when no tradesmen
// profile row exists yet. The route used to hard-code `role: "user"`
// in that branch, which lied to the client when /api/auth/role-intent
// had already stamped `tradesman` in user_roles - breaking every
// downstream guard that reads /api/tradesmen/me (header chrome, the
// /tradesman/profile/edit page, useRole's fallback fetch).
//
// Now: read user_roles when the tradesmen row is absent; surface
// 'tradesman' or 'admin' if stamped, fall back to 'user' otherwise.

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
const tradesmenMeGet = require("../../server/routes/tradesmen/me.get.js");

type Handler = (req: any, res: any) => Promise<void>;

function mountRoute(mysqlQuery: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    get: (_path: string, _auth: unknown, handler: Handler) => {
      captured = handler;
    },
  };
  const ctx = {
    auth: (_req: unknown, _res: unknown, next: any) => next(),
    mysqlQuery,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  tradesmenMeGet(fakeRouter, ctx);
  if (!captured) throw new Error("me.get handler was not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  return res;
}

// Stub mysqlQuery to mimic a user with NO tradesmen profile row but a
// configurable user_roles.role stamp.
function makeMysqlStub({ stampedRole }: { stampedRole: string | null }) {
  const mysqlQuery = vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    if (
      flat.startsWith("CREATE TABLE") ||
      flat.startsWith("ALTER TABLE")
    ) {
      return { affectedRows: 0 };
    }
    if (flat.includes("FROM tradesmen") && flat.includes("WHERE user_id")) {
      return [];
    }
    if (flat.startsWith("SELECT role FROM user_roles")) {
      return stampedRole ? [{ role: stampedRole }] : [];
    }
    return [];
  });
  return mysqlQuery;
}

describe("GET /api/tradesmen/me - role fallback when no profile row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns role='tradesman' when user_roles has the stamp", async () => {
    const handler = mountRoute(makeMysqlStub({ stampedRole: "tradesman" }));
    const res = mockRes();
    await handler({ user: { uid: "uid-pending-trader" } }, res);
    expect(res.json).toHaveBeenCalledWith({
      role: "tradesman",
      profile: null,
    });
  });

  it("returns role='admin' when the stamp is admin", async () => {
    const handler = mountRoute(makeMysqlStub({ stampedRole: "admin" }));
    const res = mockRes();
    await handler({ user: { uid: "uid-admin" } }, res);
    expect(res.json).toHaveBeenCalledWith({
      role: "admin",
      profile: null,
    });
  });

  it("returns role='user' when no user_roles row exists (genuine homeowner)", async () => {
    const handler = mountRoute(makeMysqlStub({ stampedRole: null }));
    const res = mockRes();
    await handler({ user: { uid: "uid-homeowner" } }, res);
    expect(res.json).toHaveBeenCalledWith({
      role: "user",
      profile: null,
    });
  });

  it("falls back to 'user' if the stamp is something unknown", async () => {
    const handler = mountRoute(makeMysqlStub({ stampedRole: "wizard" }));
    const res = mockRes();
    await handler({ user: { uid: "uid-weird" } }, res);
    expect(res.json).toHaveBeenCalledWith({
      role: "user",
      profile: null,
    });
  });
});
