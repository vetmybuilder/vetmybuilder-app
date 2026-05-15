import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger to keep test output quiet.
vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Mock location lib (used optionally in the route).
vi.mock("../../server/lib/location.js", () => ({
  extractLocationTokens: vi.fn().mockReturnValue({}),
}));

// The route prefers ctx.matchByName when present and only falls back to
// requiring server/lib/companiesHouse.js when ctx doesn't supply one
// (see me.put.js). We inject the mock through ctx, which sidesteps the
// MOCK_EXTERNAL_SERVICES=1 short-circuit in the real lib (NODE_ENV=test
// returns a synthetic match that would override our test expectations).
const matchByNameMock = vi.fn();

// Mock web-presence so it never escapes the test.
vi.mock("../../server/lib/webPresence.js", () => ({
  verifyWebPresence: vi.fn().mockResolvedValue({ verified: false, reasons: [] }),
}));

// Mock claimPipelineEntry (fire-and-forget in the route).
vi.mock("../../server/lib/claimPipelineEntry.js", () => ({
  claimPipelineEntry: vi.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tradesmenMePut = require("../../server/routes/tradesmen/me.put.js");

type Handler = (req: any, res: any) => Promise<void>;

function loadRouteHandler(mysqlQuery: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    put: (_path: string, _auth: unknown, handler: Handler) => {
      captured = handler;
    },
  };

  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const ctx = {
    auth: (_req: unknown, _res: unknown, next: any) => next(),
    mysqlQuery,
    log,
    logActivity: vi.fn(),
    broadcastNotification: vi.fn(),
    // Inject the mocked CH lookup. me.put.js prefers ctx.matchByName
    // over the lib fallback, so this is the cleanest way to spy on it.
    matchByName: matchByNameMock,
    extractLocationTokens: () => ({}),
  };

  tradesmenMePut(fakeRouter, ctx);
  if (!captured) throw new Error("route handler was not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq(body: Record<string, unknown>) {
  return {
    user: { uid: "uid-attacker" },
    body,
  };
}

/**
 * Build a stateful mysqlQuery stub that:
 *  - captures every INSERT INTO tradesmen ... VALUES (...) parameter list
 *  - returns a fake "current row" on SELECT * FROM tradesmen so the
 *    score recompute step has something to chew on
 *  - swallows ALTERs, CREATEs, DELETEs, UPDATEs, the users-upsert and
 *    photo-sync calls without changing test state
 *
 * The capturedTradesmenInsert holds the full positional args from the
 * UPSERT, which mirror the INSERT column list in me.put.js. We assert on
 * the ch_status / ch_name / ch_match_score / company_number / web_verified
 * positions.
 */
function makeMysqlStub() {
  const captured: { tradesmenInsert: any[] | null } = { tradesmenInsert: null };

  const fakeRow = {
    user_id: "uid-attacker",
    company_name: "x",
    service_areas: "",
    trade_types: "",
    photo_count: 0,
    offers_discount: 0,
    discount_min_percent: 0,
    discount_max_percent: 0,
    warranty_months: 0,
    supporting_doc_count: 0,
    web_verified: 0,
    ch_status: "verified-from-server",
  };

  const mysqlQuery = vi.fn(async (sql: string, params: any[] = []) => {
    const s = String(sql || "").trim();

    // Capture the tradesmen UPSERT.
    if (/INSERT\s+INTO\s+tradesmen\s*\(/i.test(s)) {
      captured.tradesmenInsert = params;
      return { affectedRows: 1 };
    }

    // The score recompute SELECT.
    if (/SELECT\s+\*\s+FROM\s+tradesmen\s+WHERE\s+user_id\s*=\s*\?/i.test(s)) {
      return [fakeRow];
    }

    // Everything else (CREATE TABLE / ALTER / DELETE / UPDATE / users
    // upsert / photo insert) is a no-op.
    return [];
  });

  return { mysqlQuery, captured };
}

describe("PUT /api/tradesmen/me - ch_status spoof prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    matchByNameMock.mockReset();
  });

  it("ignores client-supplied chStatus and uses matchByName verdict instead", async () => {
    // matchByName returns an 'ambiguous' verdict - the saved row MUST
    // reflect that, NOT the 'verified' the client posted.
    matchByNameMock.mockResolvedValue({
      verdict: "ambiguous",
      best: { number: "99999999", name: "Server Match Ltd", score: 0.42 },
    });

    const { mysqlQuery, captured } = makeMysqlStub();
    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      mockReq({
        companyName: "x",
        companyNumber: "12345678",
        chStatus: "verified", // attacker tries to self-flag
        chName: "Attacker Wuz Here Ltd",
        chMatchScore: 1,
        web_verified: 1,
        webVerified: 1,
      }),
      res,
    );

    // matchByName must have been called, even though the client sent a
    // companyNumber (it's only a hint now).
    expect(matchByNameMock).toHaveBeenCalled();
    expect(matchByNameMock.mock.calls[0][0]).toMatchObject({ name: "x" });

    // We must have written a tradesmen row.
    expect(captured.tradesmenInsert).not.toBeNull();
    const params = captured.tradesmenInsert as any[];

    // Column order in the INSERT (from me.put.js):
    //   0  user_id
    //   1  company_name
    //   2  contact_name
    //   3  phone
    //   4  email
    //   5  trade_types
    //   6  service_areas
    //   7  web_verified
    //   8  web_url
    //   9  social_links_json
    //  10  review_links_json
    //  11  offers_discount
    //  12  warranty_months
    //  13  photo_count
    //  14  supporting_doc_count
    //  15  supporting_docs_json
    //  16  discount_min_percent
    //  17  discount_max_percent
    //  18  company_number
    //  19  ch_status
    //  20  ch_name
    //  21  ch_checked_at
    //  22  ch_match_score
    const persistedWebVerified = params[7];
    const persistedCompanyNumber = params[18];
    const persistedChStatus = params[19];
    const persistedChName = params[20];
    const persistedChMatchScore = params[22];

    // ch_status must be derived from matchByName's verdict, NOT the
    // client's "verified" string.
    expect(persistedChStatus).toBe("ambiguous");

    // ch_name / ch_match_score / company_number must come from the
    // server lookup result, never the client body.
    expect(persistedChName).toBe("Server Match Ltd");
    expect(persistedChMatchScore).toBe(0.42);
    expect(persistedCompanyNumber).toBe("99999999");

    // web_verified must come from verifyWebPresence (mocked to false),
    // never from body.web_verified / body.webVerified.
    expect(persistedWebVerified).toBe(0);
  });

  it("persists ch_status='verified' only when matchByName returns a verified verdict", async () => {
    matchByNameMock.mockResolvedValue({
      verdict: "verified",
      best: { number: "00000001", name: "Real Ltd", score: 0.98 },
    });

    const { mysqlQuery, captured } = makeMysqlStub();
    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      mockReq({
        companyName: "Real Ltd",
        // NO client-supplied trust fields this time.
      }),
      res,
    );

    expect(captured.tradesmenInsert).not.toBeNull();
    const params = captured.tradesmenInsert as any[];
    expect(params[19]).toBe("verified");
    expect(params[18]).toBe("00000001");
    expect(params[20]).toBe("Real Ltd");
  });
});
