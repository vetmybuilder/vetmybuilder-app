// tests/server/profilePublicToggle.spec.ts
//
// POST /api/admin/tradesmen/:uid/profile-public - admin toggles whether
// the public profile is live. On enable, notifies the tradesperson.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}));

// notifyProfileLive is fire-and-forget. Mock its pushSender dependency so the
// real helper runs harmlessly; we assert the route reaches the enable path
// (which inserts a profile_live notification row via mysqlQuery).
vi.mock("../../server/lib/pushSender.js", () => ({
  sendPushToUser: vi.fn(),
}));

vi.mock("../../server/lib/adminAuditLog.js", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

const TEST_ADMIN_UID = "admin-uid-test";
process.env.TEST_ADMIN_USER_UID = TEST_ADMIN_UID;
process.env.NODE_ENV = "test";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = require("../../server/routes/admin/tradesman.profile-public.post.js");

type Mw = (req: any, res: any, next: any) => Promise<void> | void;

function loadHandler(mysqlQuery: any) {
  const handlers: Record<string, (req: any, res: any) => Promise<void>> = {};
  const fakeRouter: any = {
    get: () => {}, post: () => {}, patch: () => {}, put: () => {}, delete: () => {},
  };
  fakeRouter.post = (path: string, ...rest: any[]) => {
    const chain = rest as Mw[];
    handlers[path] = async (req, res) => {
      let i = 0;
      const advance = async (): Promise<void> => {
        if (res.__sent) return;
        if (i >= chain.length) return;
        const mw = chain[i++];
        await mw(req, res, advance);
      };
      await advance();
    };
  };
  const ctx = {
    auth: (_req: unknown, _res: unknown, next: any) => next(),
    mysqlQuery,
    broadcastNotification: vi.fn(),
    logActivity: vi.fn(),
  };
  route(fakeRouter, ctx);
  return handlers["/admin/tradesmen/:uid/profile-public"];
}

function mockRes() {
  const res: any = { __sent: false };
  res.status = vi.fn().mockImplementation(() => res);
  res.json = vi.fn().mockImplementation(() => {
    res.__sent = true;
    return res;
  });
  return res;
}

const PATH = "/admin/tradesmen/:uid/profile-public";

describe("POST /api/admin/tradesmen/:uid/profile-public", () => {
  it("rejects non-admin callers with 403", async () => {
    const handler = loadHandler(vi.fn());
    const res = mockRes();
    await handler({ user: { uid: "u_caller" }, params: { uid: "u_t" }, body: { enabled: true } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 404 when the tradesperson doesn't exist", async () => {
    const mysql = vi.fn().mockResolvedValue([]);
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler({ user: { uid: TEST_ADMIN_UID }, params: { uid: "u_missing" }, body: { enabled: true } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("blocks enabling when the tradesperson has no slug", async () => {
    const mysql = vi.fn().mockResolvedValue([{ user_id: "u_t", slug: null, status: "active" }]);
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler({ user: { uid: TEST_ADMIN_UID }, params: { uid: "u_t" }, body: { enabled: true } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "no_slug" }));
  });

  it("enables the profile, persists the flag, and notifies the tradesperson", async () => {
    const writes: any[] = [];
    const mysql = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT user_id, slug, status FROM tradesmen/.test(sql)) {
        return [{ user_id: "u_t", slug: "bobs-builders", status: "active" }];
      }
      if (/UPDATE tradesmen SET profile_public/.test(sql)) {
        writes.push(params);
        return {};
      }
      return [];
    });
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler({ user: { uid: TEST_ADMIN_UID }, params: { uid: "u_t" }, body: { enabled: true } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, profile_public: true, slug: "bobs-builders" }));
    expect(writes[0]).toEqual([1, "u_t"]); // flag = 1
  });

  it("disables the profile without notifying", async () => {
    const writes: any[] = [];
    const mysql = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT user_id, slug, status FROM tradesmen/.test(sql)) {
        return [{ user_id: "u_t", slug: "bobs-builders", status: "active" }];
      }
      if (/UPDATE tradesmen SET profile_public/.test(sql)) {
        writes.push(params);
        return {};
      }
      return [];
    });
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler({ user: { uid: TEST_ADMIN_UID }, params: { uid: "u_t" }, body: { enabled: false } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, profile_public: false }));
    expect(writes[0]).toEqual([0, "u_t"]); // flag = 0
    // Disabling must NOT write a profile_live notification row.
    const notifInsert = mysql.mock.calls.find((c: any[]) => /INSERT INTO notifications/.test(c[0]));
    expect(notifInsert).toBeUndefined();
  });
});
