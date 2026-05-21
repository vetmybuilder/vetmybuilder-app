// tests/server/upload-photos-r2.spec.ts
//
// Pins the photo-URL defensive path in me.put.js so an object-shaped
// payload (e.g. R2's `{ key, publicUrl }` leaking through a client
// bug) can never become "[object Object]" in tradesmen_photos.url
// again.
//
// Regression: uploadToR2 resolves to `{ key, publicUrl }`. The
// upload-photos route used to return that shape verbatim; the
// frontend then sent it back to PUT /api/tradesmen/me, where
// String(obj).trim() produced the literal "[object Object]" string,
// and the next photo render attempt 404'd. The fix has two layers:
//   1. upload-photos.post.js now extracts publicUrl per result
//      (source of truth for new uploads).
//   2. me.put.js's toPhotoArray filters/normalises object entries
//      AND drops the "[object Object]" sentinel, so a future
//      client-side regression can't repeat the corruption.
//
// This spec drives layer 2 via the live me.put.js route handler.

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

vi.mock("../../server/lib/webPresence.js", () => ({
  verifyWebPresence: vi.fn().mockResolvedValue({ verified: false, reasons: [] }),
}));

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

// Captures every photo INSERT and exposes the url params for asserting.
function makeMysqlStub() {
  const photoInsertParams: Array<unknown[]> = [];

  const mysqlQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    const flat = sql.replace(/\s+/g, " ").trim();

    if (flat.startsWith("INSERT INTO tradesmen_photos")) {
      photoInsertParams.push(params || []);
      return { affectedRows: 1 };
    }
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

  return { mysqlQuery, photoInsertParams };
}

describe("PUT /api/tradesmen/me - photo URL hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts publicUrl when an R2 result object leaks through the client", async () => {
    const { mysqlQuery, photoInsertParams } = makeMysqlStub();
    const handler = loadHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-trader" },
        body: {
          companyName: "BBC Co",
          tradeTypes: ["Plumber"],
          serviceAreas: ["E4"],
          // Simulate the broken client payload from the original bug.
          photoUrls: [
            { key: "tradesmen/a-key", publicUrl: "https://cdn.example.com/a.jpg" },
            { key: "tradesmen/b-key", publicUrl: "https://cdn.example.com/b.jpg" },
          ],
        },
      },
      res,
    );

    expect(photoInsertParams).toHaveLength(2);
    const urls = photoInsertParams.map((p) => p[1]);
    expect(urls).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);

    // Belt and braces: nothing in the captured params should ever be
    // the literal "[object Object]" string.
    for (const params of photoInsertParams) {
      expect(params[1]).not.toBe("[object Object]");
    }
  });

  it("drops legacy '[object Object]' sentinels instead of re-saving them", async () => {
    const { mysqlQuery, photoInsertParams } = makeMysqlStub();
    const handler = loadHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-trader" },
        body: {
          companyName: "BBC Co",
          tradeTypes: ["Plumber"],
          serviceAreas: ["E4"],
          // A re-save round-trip where the client read the corrupted
          // string from /api/tradesmen/me and POSTed it back unchanged.
          photoUrls: [
            "[object Object]",
            "/uploads/tradesmen/real.jpg",
            "[object Object]",
          ],
        },
      },
      res,
    );

    expect(photoInsertParams).toHaveLength(1);
    expect(photoInsertParams[0][1]).toBe("/uploads/tradesmen/real.jpg");
  });

  it("still saves plain string URLs (the happy path) unchanged", async () => {
    const { mysqlQuery, photoInsertParams } = makeMysqlStub();
    const handler = loadHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-trader" },
        body: {
          companyName: "BBC Co",
          tradeTypes: ["Plumber"],
          serviceAreas: ["E4"],
          photoUrls: [
            "https://cdn.example.com/a.jpg",
            "/uploads/tradesmen/b.jpg",
          ],
        },
      },
      res,
    );

    const urls = photoInsertParams.map((p) => p[1]);
    expect(urls).toEqual([
      "https://cdn.example.com/a.jpg",
      "/uploads/tradesmen/b.jpg",
    ]);
  });
});
