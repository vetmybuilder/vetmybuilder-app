// tests/server/google-reviews.get.spec.ts
//
// Regression for: GET /api/tradesmen/:id/google-reviews returned 500 on prod
// because the SELECT referenced `tradesmen.id`, which does not exist - the
// table's PK is `user_id`. The route now selects/filters by user_id only.
//
// These tests pin:
//   1. The SQL never references a `tradesmen.id` column.
//   2. Lookup is by user_id (Firebase uid string).
//   3. A valid request returns 200 with the expected payload shape.
//   4. Missing tradesman -> 404 (not 500).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleReviewsGet = require("../../server/routes/tradesmen/google-reviews.get.js");

type Handler = (req: any, res: any) => Promise<void>;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mountRoute(mysqlQuery: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    get: (_path: string, handler: Handler) => {
      captured = handler;
    },
  };
  const ctx = {
    mysqlQuery,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  googleReviewsGet(fakeRouter, ctx);
  if (!captured) throw new Error("route handler was not captured");
  return captured;
}

// Stub mysqlQuery to mimic the prod schema:
//  - INFORMATION_SCHEMA returns the column list (incl. google_* + company_number)
//  - the tradesmen SELECT returns one matching row by user_id
//  - SHOW TABLES LIKE 'company_verifications' returns [] (no fallback)
function makeMysqlStub(opts: {
  tradesmenRow?: Record<string, unknown> | null;
}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];

  const mysqlQuery = vi.fn((sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const flat = sql.replace(/\s+/g, " ").trim();

    if (flat.startsWith("SELECT COLUMN_NAME")) {
      return Promise.resolve([
        { COLUMN_NAME: "user_id" },
        { COLUMN_NAME: "company_name" },
        { COLUMN_NAME: "company_number" },
        { COLUMN_NAME: "google_place_id" },
        { COLUMN_NAME: "google_rating" },
        { COLUMN_NAME: "google_reviews_count" },
      ]);
    }

    if (flat.startsWith("SHOW TABLES LIKE")) {
      return Promise.resolve([]);
    }

    if (flat.includes("FROM tradesmen")) {
      return Promise.resolve(opts.tradesmenRow ? [opts.tradesmenRow] : []);
    }

    return Promise.resolve([]);
  });

  return { mysqlQuery, calls };
}

describe("GET /api/tradesmen/:id/google-reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never references the non-existent tradesmen.id column", async () => {
    const { mysqlQuery, calls } = makeMysqlStub({
      tradesmenRow: {
        user_id: "uid-abc",
        company_name: "Elegant Building",
        company_number: "12758227",
        google_place_id: "ChIJ_place_id",
        google_rating: 4.8,
        google_reviews_count: 42,
      },
    });

    const handler = mountRoute(mysqlQuery);
    await handler(
      { params: { id: "uid-abc" } },
      mockRes(),
    );

    const tradesmenSelect = calls.find((c) =>
      c.sql.replace(/\s+/g, " ").includes("FROM tradesmen"),
    );
    expect(tradesmenSelect).toBeDefined();

    // The regression: previous SQL had `SELECT id, ...` and
    // `WHERE ... OR (? IS NOT NULL AND id = ?)`. Neither must come back.
    const flat = tradesmenSelect!.sql.replace(/\s+/g, " ");
    expect(flat).not.toMatch(/SELECT[^F]*\bid\b/);
    expect(flat).not.toMatch(/\bid\s*=\s*\?/);

    // And the only filter must be user_id.
    expect(flat).toMatch(/WHERE user_id = \? LIMIT 1/);
  });

  it("returns 200 with the expected payload for a known tradesperson", async () => {
    const { mysqlQuery } = makeMysqlStub({
      tradesmenRow: {
        user_id: "uid-abc",
        company_name: "Elegant Building",
        company_number: "12758227",
        google_place_id: "ChIJ_place_id",
        google_rating: 4.8,
        google_reviews_count: 42,
      },
    });

    const handler = mountRoute(mysqlQuery);
    const res = mockRes();
    await handler({ params: { id: "uid-abc" } }, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        userId: "uid-abc",
        companyName: "Elegant Building",
        companyNumber: "12758227",
        googlePlaceId: "ChIJ_place_id",
        rating: 4.8,
        reviewsCount: 42,
      }),
    );
  });

  it("returns 404 (not 500) when the tradesperson does not exist", async () => {
    const { mysqlQuery } = makeMysqlStub({ tradesmenRow: null });

    const handler = mountRoute(mysqlQuery);
    const res = mockRes();
    await handler({ params: { id: "uid-missing" } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "tradesman_not_found" });
  });
});
