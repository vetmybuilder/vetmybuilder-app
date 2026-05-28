// tests/server/tradesmen-jobs-swipe.spec.ts
//
// Unit tests for:
//   1. POST /api/tradesmen/jobs/:projectId/swipe  (builder-initiated)
//   2. POST /api/projects/:id/swipe               (homeowner mutual-match detection)

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadFlags, clearFlagCache } = require("../../server/lib/featureFlags");

// Payments flag ON: the subscribed-tier swipe gate (isBuilderSubscribed)
// only runs when payments are enabled, which is the behaviour these chains
// are written for. Prime the shared flag cache so isFlagEnabled reads it
// without issuing an extra DB query that would shift the mock chain.
async function enablePayments() {
  clearFlagCache();
  await loadFlags(async () => [{ flag_key: "payments", enabled: 1 }]);
}

// Mock pushSender so we don't need VAPID keys in tests
vi.mock("../../server/lib/pushSender.js", () => ({
  sendPushToUser: vi.fn(),
}));

// Note: the builder swipe route now gates subscribed-tier right-swipes
// behind isBuilderSubscribed() which runs an additional
// builder_subscriptions SELECT. Each right-swipe test mocks one extra
// query in the chain (returning a non-empty array so the predicate
// resolves to "subscribed"). Look for the comment "isBuilderSubscribed"
// in each .mockResolvedValueOnce chain below.

// ---- helpers ----------------------------------------------------------------

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * Mounts the builder swipe route and returns a runner that simulates the full
 * Express middleware chain (auth + requireActiveTradesman + handler).
 *
 * The roles middleware issues two DB queries per call:
 *   1. SELECT role FROM user_roles WHERE uid = ?
 *   2. SELECT ... FROM tradesmen WHERE user_id = ?
 *
 * Callers must prepend those two mock responses to their q mock chain.
 * Helper `activeTradesmanRows()` returns the two standard mock responses.
 */
function loadBuilderSwipeHandler(ctx: any) {
  const mount = require("../../server/routes/tradesmen/jobs/swipe.post.js");
  const middlewares: any[] = [];
  mount(
    {
      post: (_path: string, ...fns: any[]) => {
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
        // next() resolves the promise — middleware called next() synchronously or async
        const next = () => {
          nextCalled = true;
          resolve();
        };
        try {
          const result = mw(req, res, next);
          // If mw is async and didn't call next() yet, wait for the promise
          if (result && typeof result.then === "function") {
            result.then(() => {
              if (!nextCalled) resolve();
            }, reject);
          } else if (!nextCalled) {
            // Synchronous mw that didn't call next() — it sent a response
            resolve();
          }
        } catch (e) {
          reject(e);
        }
      });
      // If the middleware sent a response (didn't call next), stop the chain
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
      email: "ace@example.com",
    }],
  ];
}

/**
 * Mount the homeowner swipe route and capture the final handler only.
 * (That route is auth + handler, 3-arg pattern.)
 */
function loadHomeownerSwipeHandler(ctx: any) {
  const mount = require("../../server/routes/projects/swipe.post.js");
  let captured: any = null;
  mount(
    { post: (_p: string, _auth: any, h: any) => { captured = h; } },
    ctx,
  );
  if (!captured) throw new Error("handler not captured");
  return captured;
}

// ---- describe blocks --------------------------------------------------------

describe("POST /api/tradesmen/jobs/:projectId/swipe — builder-initiated", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await enablePayments();
  });
  afterAll(() => clearFlagCache());

  it("builder right-swipes a job with no homeowner interest yet → pending, matched:false", async () => {
    const q = vi
      .fn()
      // requireActiveTradesman: user_roles + tradesmen
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "London", email: "b@example.com",
      }])
      // handler queries
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "h1" }]) // project lookup
      .mockResolvedValueOnce([])                              // recommendations lookup → subscribed
      .mockResolvedValueOnce([{ status: "active" }])          // isBuilderSubscribed → builder_subscriptions
      .mockResolvedValueOnce({ affectedRows: 1 })             // UPSERT swipe_interest
      .mockResolvedValueOnce([{ homeowner_swiped_at: null }]); // rowCheck — no homeowner swipe

    const handler = loadBuilderSwipeHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      broadcastNotification: vi.fn(),
      logActivity: vi.fn(),
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, params: { projectId: "1" }, body: { decision: "right" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, matched: false, projectId: 1 }),
    );

    // Verify UPSERT used 'pending' status
    const upsertCall = q.mock.calls.find(([sql]: [string]) =>
      /INSERT INTO swipe_interest/i.test(sql),
    );
    expect(upsertCall).toBeDefined();
    expect(upsertCall[1]).toContain("pending");
  });

  it("builder left-swipes → declined_by_builder, matched:false", async () => {
    const q = vi
      .fn()
      // requireActiveTradesman
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "London", email: "b@example.com",
      }])
      // handler queries
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "h1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 }); // UPSERT (no rowCheck for left-swipe)

    const handler = loadBuilderSwipeHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      broadcastNotification: vi.fn(),
      logActivity: vi.fn(),
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, params: { projectId: "1" }, body: { decision: "left" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, matched: false }),
    );

    const upsertCall = q.mock.calls.find(([sql]: [string]) =>
      /INSERT INTO swipe_interest/i.test(sql),
    );
    expect(upsertCall).toBeDefined();
    expect(upsertCall[1]).toContain("declined_by_builder");
  });

  it("homeowner already right-swiped, builder right-swipes → matched:true, two notifications inserted", async () => {
    const q = vi
      .fn()
      // requireActiveTradesman
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "London", email: "b@example.com",
      }])
      // handler queries
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "h1" }])            // project lookup
      .mockResolvedValueOnce([])                                          // recs lookup → subscribed
      .mockResolvedValueOnce([{ status: "active" }])                      // isBuilderSubscribed → builder_subscriptions
      .mockResolvedValueOnce({ affectedRows: 1 })                         // UPSERT swipe_interest
      // rowCheck now also reads `status` to confirm the row is still
      // pending (terminal states don't form matches). Both fields needed.
      .mockResolvedValueOnce([{ status: "pending", homeowner_swiped_at: new Date() }])
      .mockResolvedValueOnce({ affectedRows: 1 })                         // UPDATE status='matched'
      // fireMatchFormed queries:
      .mockResolvedValueOnce([{
        projectId: 1,
        projectName: "Test Kitchen",
        ownerUserId: "h1",
        tradesmanUid: "b1",
        tradesmanName: "Ace Builders",
      }])
      .mockResolvedValueOnce({ affectedRows: 1 })  // notification INSERT homeowner
      .mockResolvedValueOnce({ affectedRows: 1 }); // notification INSERT tradesman

    const broadcastNotification = vi.fn();

    const handler = loadBuilderSwipeHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      broadcastNotification,
      logActivity: vi.fn(),
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, params: { projectId: "1" }, body: { decision: "right" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, matched: true, projectId: 1 }),
    );

    // Two notification inserts
    const notifInserts = q.mock.calls.filter(([sql]: [string]) =>
      /INSERT INTO notifications/i.test(sql),
    );
    expect(notifInserts).toHaveLength(2);

    // Homeowner notification message
    expect(notifInserts[0][1][1]).toMatch(/You matched with Ace Builders/);
    // Tradesman notification message
    expect(notifInserts[1][1][1]).toMatch(/You matched with a homeowner/);

    // Broadcast called twice
    expect(broadcastNotification).toHaveBeenCalledTimes(2);
  });

  it("builder cannot swipe their own project → 403", async () => {
    const q = vi
      .fn()
      // requireActiveTradesman
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "London", email: "b@example.com",
      }])
      // handler queries
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "b1" }]); // builder is project owner

    const handler = loadBuilderSwipeHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      broadcastNotification: vi.fn(),
      logActivity: vi.fn(),
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, params: { projectId: "1" }, body: { decision: "right" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/own project/i) }),
    );
  });

  it("re-swipe right is idempotent — no extra notifications if homeowner hasn't swiped", async () => {
    const q = vi
      .fn()
      // requireActiveTradesman
      .mockResolvedValueOnce([{ role: "tradesman" }])
      .mockResolvedValueOnce([{
        user_id: "b1", company_name: "Ace Builders", status: "active",
        subscription_status: "active", contact_credits: 5,
        trade_types: "builder", service_areas: "London", email: "b@example.com",
      }])
      // handler queries
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "h1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "active" }])           // isBuilderSubscribed → builder_subscriptions
      .mockResolvedValueOnce({ affectedRows: 0 })              // UPSERT (ON DUPLICATE — row updated)
      .mockResolvedValueOnce([{ homeowner_swiped_at: null }]); // no homeowner swipe

    const handler = loadBuilderSwipeHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      broadcastNotification: vi.fn(),
      logActivity: vi.fn(),
    });

    const res = mockRes();
    await handler(
      { user: { uid: "b1", email: "b@example.com" }, params: { projectId: "1" }, body: { decision: "right" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ matched: false }),
    );

    // No notification inserts
    const notifInserts = q.mock.calls.filter(([sql]: [string]) =>
      /INSERT INTO notifications/i.test(sql),
    );
    expect(notifInserts).toHaveLength(0);
  });
});

describe("POST /api/projects/:id/swipe — homeowner mutual-match detection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builder already right-swiped, homeowner right-swipes → matched:true, two notifications inserted", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "h1" }])  // project check
      .mockResolvedValueOnce([{ user_id: "b1" }])              // builder check
      // The route now reads the existing source first so a homeowner
      // right-swipe doesn't clobber a paid_unlock builder row's source.
      // In this scenario the builder right-swiped first, so a row
      // already exists with source='subscribed'.
      .mockResolvedValueOnce([{ source: "subscribed" }])        // SELECT source FROM swipe_interest
      .mockResolvedValueOnce({ affectedRows: 1 })               // UPSERT swipe_interest
      // rowCheck — builder already swiped. Now also reads `status` to
      // confirm the row is still pending before forming a match.
      .mockResolvedValueOnce([{ status: "pending", builder_swiped_at: new Date() }])
      .mockResolvedValueOnce({ affectedRows: 1 })               // UPDATE status='matched'
      // fireMatchFormed queries:
      .mockResolvedValueOnce([{
        projectId: 1,
        projectName: "Loft Conversion",
        ownerUserId: "h1",
        tradesmanUid: "b1",
        tradesmanName: "Skyline Builders",
      }])
      .mockResolvedValueOnce({ affectedRows: 1 })  // notification INSERT homeowner
      .mockResolvedValueOnce({ affectedRows: 1 }); // notification INSERT tradesman

    const broadcastNotification = vi.fn();

    const handler = loadHomeownerSwipeHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      broadcastNotification,
      logActivity: vi.fn(),
    });

    const res = mockRes();
    await handler(
      {
        user: { uid: "h1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "right", source: "subscribed" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, status: "matched", matched: true }),
    );

    const notifInserts = q.mock.calls.filter(([sql]: [string]) =>
      /INSERT INTO notifications/i.test(sql),
    );
    expect(notifInserts).toHaveLength(2);
    expect(broadcastNotification).toHaveBeenCalledTimes(2);
  });
});
