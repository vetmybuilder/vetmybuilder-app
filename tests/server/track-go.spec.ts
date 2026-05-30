// tests/server/track-go.spec.ts
//
// Covers GET /api/track/go/:code - the QR / short-link endpoint that
// logs an acquisition scan and 302s to the trade signup landing page.

import { describe, it, expect, vi, beforeEach } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mountTrackGo = require("../../server/routes/track/go.get.js");

type Handler = (req: any, res: any) => Promise<void> | void;

function loadHandler(ctx: any): Handler {
  let captured: Handler | null = null;
  const router: any = {
    get: (_path: string, handler: Handler) => {
      captured = handler;
    },
  };
  mountTrackGo(router, ctx);
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.redirect = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq(code: string, headers: Record<string, string> = {}) {
  return {
    params: { code },
    headers: { "user-agent": "test-ua", ...headers },
    ip: "10.0.0.1",
    connection: {},
  } as any;
}

describe("GET /api/track/go/:code", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs the scan and 302s to the trade signup page with ?ref=<code>", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const handler = loadHandler({ mysqlQuery });
    const res = mockRes();
    await handler(mockReq("flyer-e4-2026-05"), res);

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      "/tradesman/register-tradesmen?ref=flyer-e4-2026-05",
    );
    // First call is the CREATE TABLE IF NOT EXISTS bootstrap; second is the INSERT.
    const insertCall = mysqlQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO acquisition_scans"),
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall![1][0]).toBe("flyer-e4-2026-05");
    expect(insertCall![1][1]).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(insertCall![1][2]).toBe("test-ua");
  });

  it("redirects without logging when the code fails the alphabet check", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const handler = loadHandler({ mysqlQuery });
    const res = mockRes();
    await handler(mockReq("oops; DROP TABLE--"), res);

    expect(res.redirect).toHaveBeenCalledWith(302, "/tradesman/register-tradesmen");
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("still redirects when the DB insert fails", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (String(sql).includes("INSERT INTO")) {
        throw new Error("db down");
      }
      return [];
    });
    const handler = loadHandler({ mysqlQuery });
    const res = mockRes();
    await handler(mockReq("nextdoor-e4"), res);

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      "/tradesman/register-tradesmen?ref=nextdoor-e4",
    );
  });

  it("redirects to the bare page when mysqlQuery is absent (e.g. boot-time scan)", async () => {
    const handler = loadHandler({ mysqlQuery: undefined });
    const res = mockRes();
    await handler(mockReq("tiktok-bio"), res);

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      "/tradesman/register-tradesmen?ref=tiktok-bio",
    );
  });

  it("uses the first IP from x-forwarded-for, not the socket address", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const handler = loadHandler({ mysqlQuery });
    const res = mockRes();
    await handler(
      mockReq("ref1", { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
      res,
    );

    const insertCall = mysqlQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO acquisition_scans"),
    );
    const hashFromForwarded = insertCall![1][1];

    // Same handler call but with only the socket IP — should produce a
    // different hash, proving we read the x-forwarded-for header.
    const mysqlQuery2 = vi.fn().mockResolvedValue([]);
    const handler2 = loadHandler({ mysqlQuery: mysqlQuery2 });
    await handler2(mockReq("ref1"), mockRes());
    const hashFromSocket = mysqlQuery2.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO acquisition_scans"),
    )![1][1];

    expect(hashFromForwarded).not.toBe(hashFromSocket);
  });
});
