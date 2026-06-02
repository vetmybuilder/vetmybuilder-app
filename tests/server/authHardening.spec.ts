// tests/server/authHardening.spec.ts
//
// Security hardening for the auth surface:
//   1. The X-Sim-Uid bypass (middleware.js) must never arm in production,
//      even if ENABLE_TEST_ROUTES leaks into the prod environment.
//   2. requireAdmin's TEST_ADMIN_USER_UID escape hatch (roles.js) must never
//      grant admin in production for the same reason.
//   3. rateLimiters must never skip throttling in production, even with
//      PILOT_AREAS_BYPASS set.
//   4. GET /api/auth/check-username must be rate-limited to blunt username
//      enumeration.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
const { authMiddleware } = require("../../server/lib/middleware.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { requireAdmin } = require("../../server/lib/roles.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rateLimiters = require("../../server/lib/rateLimiters.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mountCheckUsername = require("../../server/routes/auth/check-username.get.js");

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  return res;
}

const ENV_KEYS = [
  "NODE_ENV",
  "ENABLE_TEST_ROUTES",
  "E2E_TEST_SECRET",
  "TEST_ADMIN_USER_UID",
  "TEST_ENV",
  "PILOT_AREAS_BYPASS",
  "ADMIN_EMAILS",
];
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  vi.clearAllMocks();
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("X-Sim-Uid bypass (middleware.js)", () => {
  const simHeaders = { "x-sim-uid": "sim-123", "x-test-secret": "shh" };

  it("does NOT arm in production even with ENABLE_TEST_ROUTES=1", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_TEST_ROUTES = "1";
    process.env.E2E_TEST_SECRET = "shh";

    const next = vi.fn();
    const res = mockRes();
    await authMiddleware({})({ headers: { ...simHeaders } }, res, next);

    // Bypass blocked -> falls through to token check -> 401 (no bearer token).
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("still arms outside production (e.g. e2e/dev)", async () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_TEST_ROUTES = "1";
    process.env.E2E_TEST_SECRET = "shh";

    const next = vi.fn();
    const req: any = { headers: { ...simHeaders } };
    await authMiddleware({})(req, mockRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ uid: "sim-123" });
  });
});

describe("requireAdmin TEST_ADMIN_USER_UID bypass (roles.js)", () => {
  const ctxFor = () => ({
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    // non-admin role from DB
    mysqlQuery: vi.fn().mockResolvedValue([]),
  });

  it("does NOT grant admin in production even with ENABLE_TEST_ROUTES=1", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_TEST_ROUTES = "1";
    process.env.TEST_ADMIN_USER_UID = "test-admin";
    delete process.env.ADMIN_EMAILS;

    const next = vi.fn();
    const res = mockRes();
    await requireAdmin(ctxFor())(
      { user: { uid: "test-admin", email: "x@y.com" } },
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("still grants admin via the uid bypass outside production", async () => {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_TEST_ROUTES = "1";
    process.env.TEST_ADMIN_USER_UID = "test-admin";

    const next = vi.fn();
    const res = mockRes();
    await requireAdmin(ctxFor())(
      { user: { uid: "test-admin", email: "x@y.com" } },
      res,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("rateLimiters.shouldSkip()", () => {
  it("never skips in production, even with PILOT_AREAS_BYPASS=1", () => {
    process.env.NODE_ENV = "production";
    process.env.PILOT_AREAS_BYPASS = "1";
    expect(rateLimiters.shouldSkip()).toBe(false);
  });

  it("skips under NODE_ENV=test so supertest never trips", () => {
    process.env.NODE_ENV = "test";
    delete process.env.PILOT_AREAS_BYPASS;
    expect(rateLimiters.shouldSkip()).toBe(true);
  });

  it("honours PILOT_AREAS_BYPASS outside production", () => {
    process.env.NODE_ENV = "development";
    process.env.PILOT_AREAS_BYPASS = "1";
    expect(rateLimiters.shouldSkip()).toBe(true);
  });
});

describe("GET /api/auth/check-username rate limiting", () => {
  it("registers the usernameCheckLimiter ahead of the handler", () => {
    let captured: any[] = [];
    const router: any = {
      get: (...args: any[]) => {
        if (args[0] === "/auth/check-username") captured = args;
      },
    };
    mountCheckUsername(router, { mysqlQuery: vi.fn() });

    // [path, ...middleware, handler] — limiter must be present.
    expect(captured.length).toBeGreaterThanOrEqual(3);
    expect(captured).toContain(rateLimiters.usernameCheckLimiter);
  });
});
