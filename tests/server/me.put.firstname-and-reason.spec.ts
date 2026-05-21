// tests/server/me.put.firstname-and-reason.spec.ts
//
// Two regressions pinned in one spec, both inside PUT /api/tradesmen/me:
//
// 1. firstName / lastName SPLIT: the trader's contactName is one
//    free-text field ("Olive Tester"). We split it on whitespace and
//    write firstName + lastName into the users row. Without this,
//    auth.tsx's profileComplete = !!me.firstName stays false after
//    signup, SiteHeader treats them as mid-signup and renders the
//    guest header ("Sign in / Get started") on /tradesman/jobs.
//
// 2. WEB VERIFICATION REASON: when verifyWebPresence fails we extract
//    the first "website:<code>" reason and persist it to the new
//    web_verification_reason column so admin can render a human label
//    next to the unticked website check. NULL when the check passed
//    or no website was supplied.

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

vi.mock("../../server/lib/location.js", () => ({
  extractLocationTokens: vi.fn().mockReturnValue({}),
}));

// The test env runs with MOCK_EXTERNAL_SERVICES=1 so the real
// verifyWebPresence short-circuits to:
//   { verified: false, reasons: ["website:external_services_mocked"] }
// That's actually useful here: it lets us assert on the FULL pipeline
// (verifyWebPresence -> me.put extractor -> INSERT param -> DB) end
// to end with no mock layer. Tests that want a different outcome
// pass a website that triggers an early-exit in verifyWebPresence
// (e.g. omit the website to skip the call entirely).

vi.mock("../../server/lib/claimPipelineEntry.js", () => ({
  claimPipelineEntry: vi.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tradesmenMePut = require("../../server/routes/tradesmen/me.put.js");

type Handler = (req: any, res: any) => Promise<void>;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function loadHandler(mysqlQuery: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    put: (_path: string, _auth: unknown, handler: Handler) => {
      captured = handler;
    },
  };
  const ctx = {
    auth: (_req: unknown, _res: unknown, next: any) => next(),
    mysqlQuery,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    logActivity: vi.fn(),
    broadcastNotification: vi.fn(),
    matchByName: vi.fn().mockResolvedValue(null),
    extractLocationTokens: () => ({}),
  };
  tradesmenMePut(fakeRouter, ctx);
  if (!captured) throw new Error("me.put handler was not captured");
  return captured;
}

// Captures all INSERT INTO users + INSERT INTO tradesmen calls so the
// assertions can inspect the bound params.
function makeMysqlStub() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];

  const mysqlQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const flat = sql.replace(/\s+/g, " ").trim();
    if (flat.startsWith("ALTER TABLE")) return { affectedRows: 0 };
    if (flat.startsWith("SELECT") && flat.includes("FROM tradesmen")) {
      return [
        {
          user_id: "uid-trader",
          web_verified: 0,
          ch_status: null,
          ch_name: null,
          web_url: null,
          photo_count: 0,
        },
      ];
    }
    return [];
  });

  return { mysqlQuery, calls };
}

function findUsersInsert(
  calls: Array<{ sql: string; params?: unknown[] }>,
): unknown[] | undefined {
  const row = calls.find((c) =>
    c.sql.replace(/\s+/g, " ").includes("INSERT INTO users"),
  );
  return row?.params;
}

function findTradesmenInsert(
  calls: Array<{ sql: string; params?: unknown[] }>,
): unknown[] | undefined {
  const row = calls.find((c) =>
    c.sql.replace(/\s+/g, " ").includes("INSERT INTO tradesmen ("),
  );
  return row?.params;
}

describe("PUT /api/tradesmen/me - firstName / lastName split from contactName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the first whitespace token to firstName and the rest to lastName", async () => {
    const ctx = makeMysqlStub();
    const handler = loadHandler(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-trader" },
        body: {
          companyName: "Acme Trades",
          contactName: "Olive Tester",
          email: "olive@example.com",
          tradeTypes: ["Plumber"],
          serviceAreas: ["E4"],
        },
      },
      res,
    );

    const params = findUsersInsert(ctx.calls);
    expect(params).toBeDefined();
    // Insert shape: [uid, email, firstName, lastName]
    expect(params![0]).toBe("uid-trader");
    expect(params![1]).toBe("olive@example.com");
    expect(params![2]).toBe("Olive");
    expect(params![3]).toBe("Tester");
  });

  it("falls back to firstName = full name, lastName = null when contactName has no space", async () => {
    const ctx = makeMysqlStub();
    const handler = loadHandler(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-trader" },
        body: {
          companyName: "Acme Trades",
          contactName: "Olive",
          email: "olive@example.com",
          tradeTypes: ["Plumber"],
          serviceAreas: ["E4"],
        },
      },
      res,
    );

    const params = findUsersInsert(ctx.calls);
    expect(params).toBeDefined();
    expect(params![2]).toBe("Olive");
    expect(params![3]).toBeNull();
  });

  it("keeps multi-word last names intact ('Olive Van Der Berg')", async () => {
    const ctx = makeMysqlStub();
    const handler = loadHandler(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-trader" },
        body: {
          companyName: "Acme Trades",
          contactName: "Olive Van Der Berg",
          email: "olive@example.com",
          tradeTypes: ["Plumber"],
          serviceAreas: ["E4"],
        },
      },
      res,
    );

    const params = findUsersInsert(ctx.calls);
    expect(params![2]).toBe("Olive");
    expect(params![3]).toBe("Van Der Berg");
  });
});

describe("PUT /api/tradesmen/me - web_verification_reason persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the website-prefixed reason from verifyWebPresence when verification fails", async () => {
    // In the test env MOCK_EXTERNAL_SERVICES=1 short-circuits
    // verifyWebPresence to return:
    //   { verified: false, reasons: ["website:external_services_mocked"] }
    // The route's extractor strips the "website:" prefix and writes
    // the code to the INSERT. That's exactly what we want to pin.
    const ctx = makeMysqlStub();
    const handler = loadHandler(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-trader" },
        body: {
          companyName: "Acme",
          contactName: "Olive Tester",
          email: "o@example.com",
          tradeTypes: ["Plumber"],
          serviceAreas: ["E4"],
          website: "https://www.parked-domain.example/",
        },
      },
      res,
    );

    const params = findTradesmenInsert(ctx.calls);
    expect(params).toBeDefined();
    expect(params).toContain("external_services_mocked");
    // And the "website:" prefix is stripped, not stored.
    expect(params).not.toContain("website:external_services_mocked");
  });

  it("persists null when no website was supplied (verifyWebPresence isn't called)", async () => {
    const ctx = makeMysqlStub();
    const handler = loadHandler(ctx.mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-trader" },
        body: {
          companyName: "Acme",
          contactName: "Olive Tester",
          email: "o@example.com",
          tradeTypes: ["Plumber"],
          serviceAreas: ["E4"],
          // no website
        },
      },
      res,
    );

    const params = findTradesmenInsert(ctx.calls);
    expect(params).toBeDefined();
    // No reason code in the INSERT - the slot is null.
    const reasonLikely = (params || []).filter(
      (p) =>
        typeof p === "string" &&
        /parked_or_placeholder|brand_mismatch|too_thin|external_services_mocked/.test(
          p,
        ),
    );
    expect(reasonLikely).toHaveLength(0);
  });
});
