// tests/server/check-email-beta-role.spec.ts
//
// Pins the role + flag gates on POST /api/auth/check-email and
// GET /api/auth/beta-status. Three independent admin flags stack here:
//   1. `homeowner_signup`    - master switch for homeowner registration.
//                              When OFF, homeowner signup is closed entirely
//                              (beta-status `closed:true`, check-email 403
//                              signup_closed). Does not affect traders.
//   2. `beta_code_homeowner` - invite gate for homeowner signup (email + SSO).
//   3. `beta_code_trader`    - invite gate for trader signup (email + SSO).
// Each gate is independent. BETA_CODE env is the value to match against,
// never the trigger.

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

type FlagOpts = {
  homeownerSignup?: boolean;
  betaCodeHomeowner?: boolean;
  betaCodeTrader?: boolean;
};

function flagQuery(opts: FlagOpts) {
  return vi.fn(async (sql: string) => {
    if (!String(sql).includes("feature_flags")) return [];
    const rows: Array<{ flag_key: string; enabled: number }> = [];
    if (opts.homeownerSignup) {
      rows.push({ flag_key: "homeowner_signup", enabled: 1 });
    }
    if (opts.betaCodeHomeowner) {
      rows.push({ flag_key: "beta_code_homeowner", enabled: 1 });
    }
    if (opts.betaCodeTrader) {
      rows.push({ flag_key: "beta_code_trader", enabled: 1 });
    }
    return rows;
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

  it("closes homeowner signup entirely when the master flag is off (even with a code)", async () => {
    const handler = mountCheckEmail({
      mysqlQuery: flagQuery({ homeownerSignup: false, betaCodeHomeowner: true }),
    });
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

  it("blocks homeowner signup with a wrong beta code when beta_code_homeowner is on", async () => {
    const handler = mountCheckEmail({
      mysqlQuery: flagQuery({ homeownerSignup: true, betaCodeHomeowner: true }),
    });
    const res = mockRes();
    await handler(
      {
        body: {
          email: "alice@example.com",
          betaCode: "wrong",
          role: "homeowner",
        },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "invalid_beta_code",
    });
  });

  it("lets the homeowner past the gates with the correct code when beta_code_homeowner is on", async () => {
    const handler = mountCheckEmail({
      mysqlQuery: flagQuery({ homeownerSignup: true, betaCodeHomeowner: true }),
    });
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

  it("does NOT require a code for a homeowner when beta_code_homeowner is off, even though BETA_CODE env is set", async () => {
    const handler = mountCheckEmail({
      mysqlQuery: flagQuery({ homeownerSignup: true, betaCodeHomeowner: false }),
    });
    const res = mockRes();
    const pending = handler(
      { body: { email: "alice@example.com", role: "homeowner" } },
      res,
    );
    void (pending as any)?.catch?.(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it("lets trader signup past both gates when beta_code_trader is off", async () => {
    // The gate runs before the route awaits the Firebase lookup. We don't
    // mock firebase-admin here, so awaiting the full handler would hang.
    // Note: homeowner_signup off has no effect on traders.
    const handler = mountCheckEmail({
      mysqlQuery: flagQuery({ homeownerSignup: false, betaCodeTrader: false }),
    });
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

  it("blocks trader signup with a wrong code when beta_code_trader is on", async () => {
    const handler = mountCheckEmail({
      mysqlQuery: flagQuery({ betaCodeTrader: true }),
    });
    const res = mockRes();
    await handler(
      {
        body: { email: "trader@example.com", betaCode: "wrong", role: "trader" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "invalid_beta_code",
    });
  });

  it("lets trader signup past with the correct code when beta_code_trader is on", async () => {
    const handler = mountCheckEmail({
      mysqlQuery: flagQuery({ betaCodeTrader: true }),
    });
    const res = mockRes();
    const pending = handler(
      {
        body: {
          email: "trader@example.com",
          betaCode: "test-launch-code",
          role: "trader",
        },
      },
      res,
    );
    void (pending as any)?.catch?.(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it("does NOT gate a trader when only beta_code_homeowner is on", async () => {
    const handler = mountCheckEmail({
      mysqlQuery: flagQuery({ betaCodeHomeowner: true, betaCodeTrader: false }),
    });
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

  it("does NOT gate a homeowner when only beta_code_trader is on", async () => {
    const handler = mountCheckEmail({
      mysqlQuery: flagQuery({
        homeownerSignup: true,
        betaCodeHomeowner: false,
        betaCodeTrader: true,
      }),
    });
    const res = mockRes();
    const pending = handler(
      { body: { email: "alice@example.com", role: "homeowner" } },
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

  it("reports closed:true to homeowners when the master signup flag is off", async () => {
    const handler = mountBetaStatus({
      mysqlQuery: flagQuery({ homeownerSignup: false }),
    });
    const res = mockRes();
    await handler({ query: { role: "homeowner" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: true, closed: true });
  });

  it("reports required:true to homeowners when both signup is open and beta_code_homeowner is on", async () => {
    const handler = mountBetaStatus({
      mysqlQuery: flagQuery({ homeownerSignup: true, betaCodeHomeowner: true }),
    });
    const res = mockRes();
    await handler({ query: { role: "homeowner" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: true, closed: false });
  });

  it("reports required:false to homeowners when signup is open but beta_code_homeowner is off", async () => {
    const handler = mountBetaStatus({
      mysqlQuery: flagQuery({ homeownerSignup: true, betaCodeHomeowner: false }),
    });
    const res = mockRes();
    await handler({ query: { role: "homeowner" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: false, closed: false });
  });

  it("reports required:false, closed:false to traders when no flags are on", async () => {
    const handler = mountBetaStatus({
      mysqlQuery: flagQuery({}),
    });
    const res = mockRes();
    await handler({ query: { role: "trader" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: false, closed: false });
  });

  it("reports required:true to traders when beta_code_trader is on", async () => {
    const handler = mountBetaStatus({
      mysqlQuery: flagQuery({ betaCodeTrader: true }),
    });
    const res = mockRes();
    await handler({ query: { role: "trader" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: true, closed: false });
  });

  it("ignores beta_code_homeowner for traders", async () => {
    const handler = mountBetaStatus({
      mysqlQuery: flagQuery({ betaCodeHomeowner: true, betaCodeTrader: false }),
    });
    const res = mockRes();
    await handler({ query: { role: "trader" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: false, closed: false });
  });

  it("ignores beta_code_trader for homeowners", async () => {
    const handler = mountBetaStatus({
      mysqlQuery: flagQuery({
        homeownerSignup: true,
        betaCodeHomeowner: false,
        betaCodeTrader: true,
      }),
    });
    const res = mockRes();
    await handler({ query: { role: "homeowner" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: false, closed: false });
  });

  it("defaults to homeowner-style gated response when role is missing", async () => {
    const handler = mountBetaStatus({
      mysqlQuery: flagQuery({}),
    });
    const res = mockRes();
    await handler({ query: {} }, res);
    expect(res.json).toHaveBeenCalledWith({ required: true, closed: true });
  });
});
