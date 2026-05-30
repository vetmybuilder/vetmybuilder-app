// tests/server/admin-acquisition-summary.spec.ts
//
// Covers GET /api/admin/acquisition/summary - returns one row per
// acquisition ref with scans + signups + conversion %.

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

vi.mock("../../server/lib/roles", () => ({
  requireAdmin: () => (_q: any, _r: any, n: any) => n(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mountAdminAcq = require("../../server/routes/admin/acquisition-summary.get.js");

type Handler = (req: any, res: any) => Promise<void> | void;

function loadHandler(ctx: any): Handler {
  let captured: Handler | null = null;
  const router: any = {
    get: (_path: string, ..._mids: any[]) => {
      captured = _mids[_mids.length - 1];
    },
  };
  mountAdminAcq(router, { ...ctx, auth: (_q: any, _r: any, n: any) => n() });
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("GET /api/admin/acquisition/summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rows with scans, signups, conversion, sorted by scans desc", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([
      {
        ref: "flyer-e4",
        scans: 120,
        signups: 9,
        first_scan: "2026-05-10 09:00:00",
        last_scan: "2026-05-30 18:00:00",
      },
      {
        ref: "nextdoor-e4",
        scans: 40,
        signups: 6,
        first_scan: "2026-05-12 10:00:00",
        last_scan: "2026-05-30 17:00:00",
      },
    ]);
    const handler = loadHandler({ mysqlQuery });
    const res = mockRes();
    await handler({}, res);

    expect(res.json).toHaveBeenCalledWith({
      items: [
        {
          ref: "flyer-e4",
          scans: 120,
          signups: 9,
          conversion: 9 / 120,
          firstScan: "2026-05-10 09:00:00",
          lastScan: "2026-05-30 18:00:00",
        },
        {
          ref: "nextdoor-e4",
          scans: 40,
          signups: 6,
          conversion: 6 / 40,
          firstScan: "2026-05-12 10:00:00",
          lastScan: "2026-05-30 17:00:00",
        },
      ],
    });
  });

  it("reports conversion null when scans is zero (signups but no scan log)", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([
      { ref: "manual-1", scans: 0, signups: 3, first_scan: null, last_scan: null },
    ]);
    const handler = loadHandler({ mysqlQuery });
    const res = mockRes();
    await handler({}, res);

    expect(res.json).toHaveBeenCalledWith({
      items: [
        {
          ref: "manual-1",
          scans: 0,
          signups: 3,
          conversion: null,
          firstScan: null,
          lastScan: null,
        },
      ],
    });
  });

  it("returns empty list when the DB has no rows", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const handler = loadHandler({ mysqlQuery });
    const res = mockRes();
    await handler({}, res);

    expect(res.json).toHaveBeenCalledWith({ items: [] });
  });

  it("500s on query failure rather than returning a partial body", async () => {
    const mysqlQuery = vi.fn().mockRejectedValue(new Error("boom"));
    const handler = loadHandler({ mysqlQuery });
    const res = mockRes();
    await handler({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "internal_error" }),
    );
  });
});
