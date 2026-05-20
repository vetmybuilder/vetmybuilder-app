// tests/server/check-email-beta-role.spec.ts
//
// Pins the role-aware beta gate on POST /api/auth/check-email and
// GET /api/auth/beta-status.
//
// Pre-launch, BETA_CODE in env locks down homeowner signup but trader
// signup must stay open via both email and SSO. The signup forms tag
// requests with role=trader/homeowner; the server must skip the beta
// check for traders even when BETA_CODE is set.

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

type Handler = (req: any, res: any) => Promise<void> | void;

function mountCheckEmail(): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    post: (_path: string, _limiter: unknown, handler: Handler) => {
      captured = handler;
    },
  };
  checkEmailPost(fakeRouter, {});
  if (!captured) throw new Error("check-email handler was not captured");
  return captured;
}

function mountBetaStatus(): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    get: (_path: string, handler: Handler) => {
      captured = handler;
    },
  };
  betaStatusGet(fakeRouter);
  if (!captured) throw new Error("beta-status handler was not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("POST /api/auth/check-email — role-aware beta gate", () => {
  const originalBetaCode = process.env.BETA_CODE;

  beforeEach(() => {
    process.env.BETA_CODE = "test-launch-code";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalBetaCode === undefined) {
      delete process.env.BETA_CODE;
    } else {
      process.env.BETA_CODE = originalBetaCode;
    }
  });

  it("blocks homeowner signup when the supplied beta code is wrong", async () => {
    const handler = mountCheckEmail();
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

  it("blocks signup with no role tag (defaults to homeowner) when the code is wrong", async () => {
    const handler = mountCheckEmail();
    const res = mockRes();
    await handler(
      { body: { email: "alice@example.com", betaCode: "wrong" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "invalid_beta_code",
    });
  });

  it("lets trader signup past the beta gate even with no beta code at all", async () => {
    // The beta gate is synchronous - it runs before the route awaits the
    // Firebase lookup. We don't have firebase-admin mocked in unit tests,
    // so awaiting the full handler hangs on CI (no Google creds available
    // to resolve the lookup). Instead we kick the handler off, give the
    // sync prelude one microtask tick to run, and assert on the gate
    // decision. Suppress the trailing rejection so it doesn't pollute
    // the test runner.
    const handler = mountCheckEmail();
    const res = mockRes();
    const pending = handler(
      { body: { email: "trader@example.com", role: "trader" } },
      res,
    );
    void (pending as any)?.catch?.(() => {});
    await Promise.resolve();
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_beta_code" }),
    );
  });

  it("lets the homeowner past the beta gate when the correct code is supplied", async () => {
    const handler = mountCheckEmail();
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
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_beta_code" }),
    );
  });
});

describe("GET /api/auth/beta-status — role-aware response", () => {
  const originalBetaCode = process.env.BETA_CODE;

  beforeEach(() => {
    process.env.BETA_CODE = "test-launch-code";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalBetaCode === undefined) {
      delete process.env.BETA_CODE;
    } else {
      process.env.BETA_CODE = originalBetaCode;
    }
  });

  it("reports required:true to homeowners when BETA_CODE is set", () => {
    const handler = mountBetaStatus();
    const res = mockRes();
    handler({ query: { role: "homeowner" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: true });
  });

  it("reports required:false to traders even when BETA_CODE is set", () => {
    const handler = mountBetaStatus();
    const res = mockRes();
    handler({ query: { role: "trader" } }, res);
    expect(res.json).toHaveBeenCalledWith({ required: false });
  });

  it("defaults to homeowner-style gated response when role is missing", () => {
    const handler = mountBetaStatus();
    const res = mockRes();
    handler({ query: {} }, res);
    expect(res.json).toHaveBeenCalledWith({ required: true });
  });
});
