// tests/server/tradesmen-jobs-deck.spec.ts
//
// Unit tests for GET /api/tradesmen/jobs with ?mode=deck support.
//
// Covers:
//   1. Deck mode excludes projects the builder already swiped (any status)
//   2. Deck mode returns enriched fields (budget, ownerFirstName, postedAt, aiScore,
//      propertyType, bedrooms)
//   3. List mode (no mode param) is unchanged — returns the same shape it did before
//   4. Builder cannot see their own jobs (ownerUserId<>uid guard)

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ---- helpers ----------------------------------------------------------------

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * Mounts the jobs.get route and returns a runner that simulates the full
 * Express middleware chain (auth + requireActiveTradesman + handler).
 *
 * The requireActiveTradesman middleware issues two DB queries per call:
 *   1. SELECT role FROM user_roles WHERE uid = ?
 *   2. SELECT ... FROM tradesmen WHERE user_id = ?
 *
 * All additional mock responses must be appended after these two.
 */
function loadHandler(ctx: any) {
  const mount = require("../../server/routes/tradesmen/jobs.get.js");
  const middlewares: any[] = [];
  mount(
    {
      get: (_path: string, ...fns: any[]) => {
        middlewares.push(...fns);
      },
    },
    ctx,
  );
  if (!middlewares.length) throw new Error("no middlewares captured");

  return async (req: any, res: any) => {
    for (const mw of middlewares) {
      let nextCalled = false;
      await new Promise<void>((resolve, reject) => {
        const next = () => {
          nextCalled = true;
          resolve();
        };
        try {
          const result = mw(req, res, next);
          if (result && typeof result.then === "function") {
            result.then(() => {
              if (!nextCalled) resolve();
            }, reject);
          } else if (!nextCalled) {
            resolve();
          }
        } catch (e) {
          reject(e);
        }
      });
      if (!nextCalled) break;
    }
  };
}

/**
 * Two DB responses that make requireActiveTradesman pass:
 *   query 1: user_roles → tradesman role
 *   query 2: tradesmen  → active tradesman profile
 */
function activeTradesmanRows(uid = "b1") {
  return [
    [{ role: "tradesman" }],
    [{
      user_id: uid,
      company_name: "Ace Builders",
      status: "active",
      subscription_status: "active",
      contact_credits: 5,
      trade_types: "builder",
      service_areas: "London",
      email: "b@example.com",
    }],
  ];
}

/** A realistic project row returned from the DB SELECT. */
function projectRow(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: "Kitchen Extension",
    type: "Extension",
    location: "E4",
    createdAt: new Date("2024-03-01T10:00:00Z"),
    description: "Budget: £15k–£30k\nFull rear kitchen extension.",
    propertyType: "Semi-detached",
    bedrooms: 3,
    ownerFirstName: "Alice",
    ...overrides,
  };
}

// ---- describe blocks --------------------------------------------------------

describe("GET /api/tradesmen/jobs — deck mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("deck mode issues a LEFT JOIN on swipe_interest to exclude already-swiped projects", async () => {
    const q = vi
      .fn()
      // requireActiveTradesman
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "E4", email: "b@example.com",
      }])
      // main SELECT (deck mode with LEFT JOIN swipe_interest)
      .mockResolvedValueOnce([projectRow()])
      // COUNT query
      .mockResolvedValueOnce([{ c: 1 }])
      // tradesman profile for scoring
      .mockResolvedValueOnce([{ trade_types: "builder", service_areas: "E4" }])
      // classifications
      .mockResolvedValueOnce([])
      // match_observations INSERT (fire-and-forget — tolerate it)
      .mockResolvedValue({ affectedRows: 1 });

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, query: { mode: "deck" } },
      res,
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ items: expect.any(Array), total: 1 }),
    );

    // The main SELECT must include a LEFT JOIN on swipe_interest
    const mainSelect = q.mock.calls.find(([sql]: [string]) =>
      /SELECT.*FROM projects/i.test(sql),
    );
    expect(mainSelect).toBeDefined();
    expect(mainSelect[0]).toMatch(/LEFT JOIN swipe_interest/i);
    expect(mainSelect[0]).toMatch(/si\.id IS NULL/i);
  });

  it("deck mode binds builder_uid for the JOIN — uid appears twice in params", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "E4", email: "b@example.com",
      }])
      .mockResolvedValueOnce([])          // main SELECT → empty deck
      .mockResolvedValueOnce([{ c: 0 }]) // COUNT
      .mockResolvedValueOnce([{ trade_types: "builder", service_areas: "E4" }])
      .mockResolvedValue([]);

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const res = mockRes();
    await handler(
      { user: { uid: "builder-uid-1", email: "b@example.com" }, query: { mode: "deck" } },
      res,
    );

    const mainSelect = q.mock.calls.find(([sql]: [string]) =>
      /LEFT JOIN swipe_interest/i.test(sql),
    );
    expect(mainSelect).toBeDefined();
    const selectParams: string[] = mainSelect[1];
    // uid must appear at index 0 (for the JOIN) and index 1 (for ownerUserId<>?)
    const uidOccurrences = selectParams.filter((p) => p === "builder-uid-1");
    expect(uidOccurrences).toHaveLength(2);
  });

  it("deck mode returns enriched fields: budget, ownerFirstName, postedAt, aiScore, propertyType, bedrooms", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "E4", email: "b@example.com",
      }])
      .mockResolvedValueOnce([projectRow()])
      .mockResolvedValueOnce([{ c: 1 }])
      .mockResolvedValueOnce([{ trade_types: "builder", service_areas: "E4" }])
      .mockResolvedValueOnce([])
      .mockResolvedValue({ affectedRows: 1 });

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, query: { mode: "deck" } },
      res,
    );

    const { items } = res.json.mock.calls[0][0];
    expect(items).toHaveLength(1);

    const item = items[0];
    // Core identity
    expect(item.id).toBe(1);
    expect(item.name).toBe("Kitchen Extension");
    // Enriched fields
    expect(item.budget).toBe("£15k–£30k");
    expect(item.ownerFirstName).toBe("Alice");
    expect(item.postedAt).toBeDefined();
    expect(item.aiScore).toBeTypeOf("number");
    expect(item.propertyType).toBe("Semi-detached");
    expect(item.bedrooms).toBe(3);
  });

  it("deck mode: projects with no swipe row are returned; swiped projects are excluded via SQL", async () => {
    // This test verifies the shape of the query: the LEFT JOIN + IS NULL pattern
    // ensures the DB returns only unswiped rows. We simulate this by having the
    // mock return one project (the DB already filtered out swiped ones).
    const unswiped = projectRow({ id: 2, name: "Loft Conversion" });

    const q = vi
      .fn()
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "E4", email: "b@example.com",
      }])
      .mockResolvedValueOnce([unswiped])   // only unswiped project returned by DB
      .mockResolvedValueOnce([{ c: 1 }])
      .mockResolvedValueOnce([{ trade_types: "builder", service_areas: "E4" }])
      .mockResolvedValueOnce([])
      .mockResolvedValue({ affectedRows: 1 });

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, query: { mode: "deck" } },
      res,
    );

    const { items } = res.json.mock.calls[0][0];
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(2);
  });
});

describe("GET /api/tradesmen/jobs — list mode (no mode param)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("list mode does NOT include a swipe_interest JOIN", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "E4", email: "b@example.com",
      }])
      .mockResolvedValueOnce([projectRow()])
      .mockResolvedValueOnce([{ c: 1 }])
      .mockResolvedValueOnce([{ trade_types: "builder", service_areas: "E4" }])
      .mockResolvedValueOnce([])
      .mockResolvedValue({ affectedRows: 1 });

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, query: {} },
      res,
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ items: expect.any(Array), total: 1 }),
    );

    // No swipe_interest join in list mode
    const mainSelect = q.mock.calls.find(([sql]: [string]) =>
      /SELECT.*FROM projects/i.test(sql),
    );
    expect(mainSelect).toBeDefined();
    expect(mainSelect[0]).not.toMatch(/swipe_interest/i);
  });

  it("list mode returns enriched fields (budget, postedAt, aiScore, propertyType, bedrooms, ownerFirstName)", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "E4", email: "b@example.com",
      }])
      .mockResolvedValueOnce([projectRow()])
      .mockResolvedValueOnce([{ c: 1 }])
      .mockResolvedValueOnce([{ trade_types: "builder", service_areas: "E4" }])
      .mockResolvedValueOnce([])
      .mockResolvedValue({ affectedRows: 1 });

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, query: {} },
      res,
    );

    const { items } = res.json.mock.calls[0][0];
    expect(items).toHaveLength(1);
    const item = items[0];

    expect(item.budget).toBe("£15k–£30k");
    expect(item.postedAt).toBeDefined();
    expect(item.aiScore).toBeTypeOf("number");
    expect(item.matchScore).toBeTypeOf("number"); // backward-compat alias
    expect(item.propertyType).toBe("Semi-detached");
    expect(item.bedrooms).toBe(3);
    expect(item.ownerFirstName).toBe("Alice");
  });

  it("list mode: uid only appears once in params (no swipe_interest JOIN bind)", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "list-uid", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "E4", email: "b@example.com",
      }])
      .mockResolvedValueOnce([])          // empty results
      .mockResolvedValueOnce([{ c: 0 }])
      .mockResolvedValueOnce([{ trade_types: "builder", service_areas: "E4" }])
      .mockResolvedValue([]);

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const res = mockRes();
    await handler(
      { user: { uid: "list-uid", email: "b@example.com" }, query: {} },
      res,
    );

    const mainSelect = q.mock.calls.find(([sql]: [string]) =>
      /SELECT.*FROM projects/i.test(sql),
    );
    expect(mainSelect).toBeDefined();
    const selectParams: string[] = mainSelect[1];
    const uidOccurrences = selectParams.filter((p) => p === "list-uid");
    // In list mode uid only appears once (for ownerUserId<>?)
    expect(uidOccurrences).toHaveLength(1);
  });
});

describe("GET /api/tradesmen/jobs — builder cannot see their own jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("query always includes ownerUserId<>uid guard in both list and deck mode", async () => {
    for (const mode of [undefined, "deck"]) {
      vi.clearAllMocks();
      vi.resetModules();

      const q = vi
        .fn()
        .mockResolvedValueOnce([{ role: "tradesman" }])
        .mockResolvedValueOnce([{
          user_id: "b1", company_name: "Ace Builders", status: "active",
          subscription_status: "active", contact_credits: 5,
          trade_types: "builder", service_areas: "E4", email: "b@example.com",
        }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ c: 0 }])
        .mockResolvedValueOnce([{ trade_types: "builder", service_areas: "E4" }])
        .mockResolvedValue([]);

      const handler = loadHandler({
        auth: (_q: any, _r: any, n: any) => n(),
        mysqlQuery: q,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      const res = mockRes();
      await handler(
        { user: { uid: "b1", email: "b@example.com" }, query: mode ? { mode } : {} },
        res,
      );

      const mainSelect = q.mock.calls.find(([sql]: [string]) =>
        /SELECT.*FROM projects/i.test(sql),
      );
      expect(mainSelect, `mode=${mode}`).toBeDefined();
      expect(mainSelect[0], `mode=${mode}`).toMatch(/ownerUserId<>\?/);
    }
  });
});
