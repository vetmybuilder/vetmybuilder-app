// tests/server/check-email-beta-role.spec.ts
//
// Pins the role-aware gate on POST /api/auth/check-email and
// GET /api/auth/beta-status.
//
// Two layers stack here:
//   1. The `homeowner_signup` feature flag is the master switch. When OFF,
//      homeowner signup is closed entirely (beta-status `closed:true`,
//      check-email 403 signup_closed) - even with a valid beta code.
//   2. When the flag is ON, the legacy BETA_CODE invite gate (if set) still
//      applies to homeowners.
// Traders bypass both so we can build supply ahead of opening to homeowners.

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

vi.mock("../../server/lib/rateLimiters", () => ({
  signupLimiter: (_req: unknown, _res: unknown, next: any) => next(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const checkEmailPost = require("../../server/routes/auth/check-email.post.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const betaStatusGet = require("../../server/routes/auth/beta-status.get.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { clearFlagCache } = require("../../server/lib/featureFlags.js");

type Handler = (req: any, res: any) => Promise<void> | void;

// mysqlQuery stub that reports the homeowner_signup flag as on/off.
function flagQuery(homeownerSignupOn: boolean) {
  return vi.fn(async (sql: string) => {
    if (String(sql).includes("feature_flags")) {
      return homeownerSignupOn
        ? [{ flag_key: "homeowner_signup", enabled: 1 }]
        : [];
    }
    return [];
  });
}

function mountCheckEmail(ctx: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    post: (_path: string, _limiter: unknown, handler: Handler) => {
      captured = handler;
    },
  };
  checkEmailPost(fakeRouter, ctx);
  if (!captured) throw new Error("check-email handler was not captured");
  return captured;
}

function mountBetaStatus(ctx: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    get: (_path: string, handler: Handler) => {
      captured = handler;
    },
  };
  betaStatusGet(fakeRouter, ctx);
  if (!captured) throw new Error("beta-status handler was not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("POST /api/auth/check-email — role + flag gate", () => {
  const originalBetaCode = process.env.BETA_CODE;

  beforeEach(() => {
    process.env.BETA_CODE = "test-launch-code";
    vi.clearAllMocks();
    clearFlagCache();
  });

  afterEach(() => {
    if (originalBetaCode === undefined) delete process.env.BETA_CODE;
    else process.env.BETA_CODE = originalBetaCode;
  });

  it("closes homeowner signup entirely when the flag is off (even with a code)", async () => {
    const handler = mountCheckEmail({ mysqlQuery: flagQuery(false) });
    const res = mockRes();
    await handler(
      {
        body: {
          email: "alice@example.com",
          betaCode: "test-launch-code",
          role: "homeowner",
        },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "signup_closed",
    });
  });

  it("blocks homeowner signup with a wrong beta code when the flag is on", async () => {
    const handler = mountCheckEmail({ mysqlQuery: flagQuery(true) });
    const res = mockRes();
    await handler(
      { body: { email: "alice@example.com", betaCode: "wrong", role: "homeowner" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "invalid_beta_code",
    });
  });

  it("lets trader signup past both gates even with no beta code and signup closed", async () => {
    // The gate runs before the route awaits the Firebase lookup. We don't
    // mock firebase-admin here, so awaiting the full handler would hang.
    // Kick it off, let the prelude run one microtask, assert on the gate.
    const handler = mountCheckEmail({ mysqlQuery: flagQuery(false) });
    const res = mockRes();
    const pending = handler(
      { body: { email: "trader@example.com", role: "trader" } },
      res,
    );
    void (pending as any)?.catch?.(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it("lets the homeowner past the gates with the correct code when the flag is on", async () => {
    const handler = mountCheckEmail({ mysqlQuery: flagQuery(true) });
    const res = mockRes();
    const pending = handler(
      {
        body: {
          email: "alice@example.com",
          betaCode: "test-launch-code",
          role: "homeowner",
        },
      },
      res,
    );
    void (pending as any)?.catch?.(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

describe("GET /api/auth/beta-status — role + flag response", () => {
  const originalBetaCode = process.env.BETA_CODE;

  beforeEach(() => {
    process.env.BETA_CODE = "test-launch-code";
    vi.clearAllMocks();
    clearFlagCache();
  });

  afterEach(() => {
    if (originalBetaCode === undefined) delete process.env.BETA_CODE;
    else process.env.BETA_CODE = originalBetaCode;
  });

  it("reports closed:true to homeowners when the signup flag is off", async () => {
    const handler = mountBetaStatus({ mysqlQuery: flagQuery(false) });
    const res = mockRes();
    await handler({ query: { role: "homeowner" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: true, closed: true });
  });

  it("reports required:true, closed:false to homeowners when the flag is on and BETA_CODE is set", async () => {
    const handler = mountBetaStatus({ mysqlQuery: flagQuery(true) });
    const res = mockRes();
    await handler({ query: { role: "homeowner" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: true, closed: false });
  });

  it("reports required:false, closed:false to traders regardless of flag", async () => {
    const handler = mountBetaStatus({ mysqlQuery: flagQuery(false) });
    const res = mockRes();
    await handler({ query: { role: "trader" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: false, closed: false });
  });

  it("defaults to homeowner-style gated response when role is missing", async () => {
    const handler = mountBetaStatus({ mysqlQuery: flagQuery(false) });
    const res = mockRes();
    await handler({ query: {} }, res);
    expect(res.json).toHaveBeenCalledWith({ required: true, closed: true });
  });
});
