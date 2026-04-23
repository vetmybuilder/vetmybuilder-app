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

// Mock companiesHouse lib (used optionally in the route).
vi.mock("../../server/lib/companiesHouse.js", () => ({
  matchByName: vi.fn().mockResolvedValue(null),
}));

// Mock claimPipelineEntry (fire-and-forget in the route).
vi.mock("../../server/lib/claimPipelineEntry.js", () => ({
  claimPipelineEntry: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tradesmenMePut = require("../../server/routes/tradesmen/me.put.js");

type Handler = (req: any, res: any) => Promise<void>;

/**
 * Build a stub Express router that captures the PUT /tradesmen/me handler.
 */
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
    user: { uid: "uid-test" },
    body,
  };
}

describe("PUT /api/tradesmen/me — phone validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 with field: phone when an invalid phone is supplied", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      mockReq({
        companyName: "Test Co",
        phone: "09043535345322342342",
        serviceAreas: ["E4"],
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ field: "phone" }),
    );
  });

  it("does not return 400 for phone when a valid UK mobile is supplied", async () => {
    // Let the DB calls return enough to keep the handler running.
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      mockReq({
        companyName: "Test Co",
        phone: "07123456789",
        serviceAreas: ["E4"],
      }),
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it("does not return 400 for phone when phone is empty (optional field)", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      mockReq({
        companyName: "Test Co",
        phone: "",
        serviceAreas: ["E4"],
      }),
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
  });
});
