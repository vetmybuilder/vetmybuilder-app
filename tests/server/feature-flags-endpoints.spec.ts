// tests/server/feature-flags-endpoints.spec.ts
//
// Covers the three feature-flag HTTP routes:
//   GET  /api/feature-flags             (public map)
//   GET  /api/admin/feature-flags       (admin: full list with metadata)
//   POST /api/admin/feature-flags/:key  (admin: toggle)

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

vi.mock("../../server/lib/roles", () => ({
  requireAdmin: () => (_q: any, _r: any, n: any) => n(),
}));

vi.mock("../../server/lib/adminAuditLog", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mountPublicGet = require("../../server/routes/feature-flags.get.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mountAdminGet = require("../../server/routes/admin/feature-flags.get.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mountAdminPost = require("../../server/routes/admin/feature-flags.post.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { clearFlagCache } = require("../../server/lib/featureFlags.js");

function loadHandler(mount: any, ctx: any, verb: "post" | "get") {
  let captured: any = null;
  const router: any = {
    get: (...args: any[]) => {
      if (verb === "get") captured = args[args.length - 1];
    },
    post: (...args: any[]) => {
      if (verb === "post") captured = args[args.length - 1];
    },
  };
  mount(router, ctx);
  if (!captured) throw new Error(`handler not captured for ${verb}`);
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearFlagCache();
});

describe("GET /api/feature-flags (public)", () => {
  it("returns the merged flag map", async () => {
    const mysqlQuery = vi
      .fn()
      .mockResolvedValue([{ flag_key: "payments", enabled: 1 }]);
    const handler = loadHandler(mountPublicGet, { mysqlQuery }, "get");
    const res = mockRes();
    await handler({}, res);
    expect(res.json).toHaveBeenCalledWith({
      flags: expect.objectContaining({ payments: true, homeowner_signup: false }),
    });
  });

  it("falls back to defaults when the DB read fails", async () => {
    const mysqlQuery = vi.fn().mockRejectedValue(new Error("db down"));
    const handler = loadHandler(mountPublicGet, { mysqlQuery }, "get");
    const res = mockRes();
    await handler({}, res);
    expect(res.json).toHaveBeenCalledWith({
      flags: expect.objectContaining({ payments: false, homeowner_signup: false }),
    });
  });
});

describe("GET /api/admin/feature-flags (admin)", () => {
  it("returns code definitions merged with DB state and metadata", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (String(sql).includes("flag_key, updated_at, updated_by")) {
        return [
          { flag_key: "payments", updated_at: "2026-05-01T00:00:00Z", updated_by: "admin-9" },
        ];
      }
      // loadFlags SELECT flag_key, enabled
      return [{ flag_key: "payments", enabled: 1 }];
    });
    const handler = loadHandler(
      mountAdminGet,
      { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
      "get",
    );
    const res = mockRes();
    await handler({ user: { uid: "admin-9" } }, res);

    const payload = res.json.mock.calls[0][0];
    expect(Array.isArray(payload.flags)).toBe(true);
    const payments = payload.flags.find((f: any) => f.key === "payments");
    expect(payments).toMatchObject({
      key: "payments",
      label: "Payments",
      enabled: true,
      default: false,
      updatedBy: "admin-9",
    });
    const signup = payload.flags.find((f: any) => f.key === "homeowner_signup");
    expect(signup).toMatchObject({ enabled: false, updatedBy: null });
  });
});

describe("POST /api/admin/feature-flags/:key (admin)", () => {
  it("upserts the flag and returns the new state", async () => {
    const queries: any[] = [];
    const mysqlQuery = vi.fn(async (sql: string, params?: any[]) => {
      queries.push([sql, params]);
      return { affectedRows: 1 };
    });
    const handler = loadHandler(
      mountAdminPost,
      {
        auth: (_q: any, _r: any, n: any) => n(),
        mysqlQuery,
        logActivity: vi.fn(),
      },
      "post",
    );
    const res = mockRes();
    await handler(
      { user: { uid: "admin-9" }, params: { key: "payments" }, body: { enabled: true } },
      res,
    );

    const upsert = queries.find(([sql]) =>
      String(sql).includes("INSERT INTO feature_flags"),
    );
    expect(upsert, "upsert was not issued").toBeTruthy();
    expect(upsert![1]).toContain("payments");
    expect(upsert![1]).toContain(1);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      key: "payments",
      enabled: true,
    });
  });

  it("writes enabled=0 when toggled off", async () => {
    const queries: any[] = [];
    const mysqlQuery = vi.fn(async (sql: string, params?: any[]) => {
      queries.push([sql, params]);
      return { affectedRows: 1 };
    });
    const handler = loadHandler(
      mountAdminPost,
      {
        auth: (_q: any, _r: any, n: any) => n(),
        mysqlQuery,
        logActivity: vi.fn(),
      },
      "post",
    );
    const res = mockRes();
    await handler(
      { user: { uid: "admin-9" }, params: { key: "payments" }, body: { enabled: false } },
      res,
    );
    const upsert = queries.find(([sql]) =>
      String(sql).includes("INSERT INTO feature_flags"),
    );
    expect(upsert![1]).toContain(0);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      key: "payments",
      enabled: false,
    });
  });

  it("rejects an unknown flag key with 400", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue({ affectedRows: 0 });
    const handler = loadHandler(
      mountAdminPost,
      {
        auth: (_q: any, _r: any, n: any) => n(),
        mysqlQuery,
        logActivity: vi.fn(),
      },
      "post",
    );
    const res = mockRes();
    await handler(
      { user: { uid: "admin-9" }, params: { key: "made_up" }, body: { enabled: true } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "unknown_flag" });
    expect(mysqlQuery).not.toHaveBeenCalled();
  });
});
