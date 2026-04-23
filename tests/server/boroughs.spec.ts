import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the logger to keep test output quiet
vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Import after mocks are set up
// eslint-disable-next-line @typescript-eslint/no-require-imports
const boroughsSearch = require("../../server/routes/boroughs/search.get.js");

type Handler = (req: any, res: any) => Promise<void>;

/**
 * Build a stub Express router that captures the GET /api/boroughs/search handler
 */
function loadRouteHandler(): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    get: (_path: string, handler: Handler) => {
      captured = handler;
    },
  };
  const ctx = {};
  boroughsSearch(fakeRouter, ctx);
  if (!captured) throw new Error("route handler was not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("GET /api/boroughs/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching borough for q=waltham (case-insensitive)", async () => {
    const handler = loadRouteHandler();
    const req = { query: { q: "waltham" } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0];
    const result = jsonCall[0];
    expect(result).toContainEqual({
      name: "Waltham Forest",
      outwardCodes: ["E4", "E10", "E11", "E17"],
    });
  });

  it("returns matching borough for q=WALTHAM (uppercase)", async () => {
    const handler = loadRouteHandler();
    const req = { query: { q: "WALTHAM" } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0];
    const result = jsonCall[0];
    expect(result).toContainEqual({
      name: "Waltham Forest",
      outwardCodes: ["E4", "E10", "E11", "E17"],
    });
  });

  it("returns matching borough for substring match q=hack", async () => {
    const handler = loadRouteHandler();
    const req = { query: { q: "hack" } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0];
    const result = jsonCall[0];
    expect(result).toContainEqual({
      name: "Hackney",
      outwardCodes: ["E5", "E8", "E9", "N1", "N16"],
    });
  });

  it("returns empty array for non-matching q=zzzzz", async () => {
    const handler = loadRouteHandler();
    const req = { query: { q: "zzzzz" } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0];
    const result = jsonCall[0];
    expect(result).toEqual([]);
  });

  it("returns empty array for empty string q=''", async () => {
    const handler = loadRouteHandler();
    const req = { query: { q: "" } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0];
    const result = jsonCall[0];
    expect(result).toEqual([]);
  });

  it("returns empty array for single character q='a' (too short)", async () => {
    const handler = loadRouteHandler();
    const req = { query: { q: "a" } };
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonCall = (res.json as any).mock.calls[0];
    const result = jsonCall[0];
    expect(result).toEqual([]);
  });
});
