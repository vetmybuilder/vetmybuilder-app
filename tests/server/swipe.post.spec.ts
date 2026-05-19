import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const swipeMount = require("../../server/routes/projects/swipe.post.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  swipeMount(
    { post: (_p: string, _a: any, h: any) => { captured = h; } },
    ctx,
  );
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("POST /api/projects/:id/swipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when direction is missing or invalid", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "up" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when builderUid missing", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler(
      { user: { uid: "u1" }, params: { id: "1" }, body: { direction: "right" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("upserts a pending row on right-swipe", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "u1" }]) // project check
      .mockResolvedValueOnce([{ user_id: "b1" }]) // builder exists
      // The route now does a "preserve source" SELECT before the UPSERT
      // so paid_unlock source isn't clobbered by a homeowner re-swipe.
      // Empty result here means there's no existing row, fresh insert.
      .mockResolvedValueOnce([]) // SELECT source FROM swipe_interest (preserve)
      .mockResolvedValueOnce({ affectedRows: 1 }); // UPSERT
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "right", source: "subscribed" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const upsert = q.mock.calls[3][0];
    expect(upsert).toMatch(/INSERT INTO swipe_interest/i);
    expect(upsert).toMatch(/status/i);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, status: "pending" }),
    );
  });

  // Regression: paid_unlock rows are inserted by activate-unlock.post.js
  // with status='matched' (not 'pending') even though the homeowner
  // hasn't reciprocated yet — homeowner_swiped_at is NULL. When the
  // homeowner does right-swipe, the route must still fire
  // fireMatchFormed. Earlier the check was `status === 'pending'`,
  // which missed the paid_unlock case and left both sides with no
  // notification.
  it("fires fireMatchFormed when homeowner right-swipes on a paid_unlock row (status='matched', homeowner_swiped_at was NULL)", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "u1" }]) // project
      .mockResolvedValueOnce([{ user_id: "b1" }]) // builder exists
      // Existing swipe_interest row: paid_unlock, status='matched',
      // homeowner_swiped_at is NULL → the homeowner is reciprocating.
      .mockResolvedValueOnce([
        { source: "paid_unlock", homeowner_swiped_at: null },
      ])
      .mockResolvedValueOnce({ affectedRows: 1 }) // UPSERT swipe_interest
      // Match-formation pre-check (status, builder_swiped_at, master_uid)
      .mockResolvedValueOnce([
        {
          status: "matched",
          builder_swiped_at: new Date(),
          builderMasterUid: null,
        },
      ])
      // UPDATE status='matched' (idempotent — already matched, but the
      // route runs the statement unconditionally inside the if-block)
      .mockResolvedValueOnce({ affectedRows: 1 })
      // fireMatchFormed runs a sequence of SELECTs/INSERTs internally.
      // We don't care about the exact contents here — just keep
      // returning empty so it completes without throwing.
      .mockResolvedValue([]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      broadcastNotification: vi.fn(),
      logActivity: vi.fn(),
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "right", source: "paid_unlock" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    // The response shape signals a successful match formation only
    // when the if-block ran and fireMatchFormed completed.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        status: "matched",
        matched: true,
      }),
    );
  });

  it("does NOT re-fire fireMatchFormed when homeowner right-swipes a row they've already swiped on", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "u1" }])
      .mockResolvedValueOnce([{ user_id: "b1" }])
      // Existing row: homeowner already swiped previously
      .mockResolvedValueOnce([
        { source: "subscribed", homeowner_swiped_at: new Date() },
      ])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "right", source: "subscribed" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    // No match formation block — falls through to the default
    // pending/matched response. The match-formation rowCheck SELECT
    // would have triggered another q call; we only fed 4 values.
    expect(q.mock.calls.length).toBe(4);
  });

  // Regression: when a homeowner LEFT-swipes a paid_unlock card, the
  // trade who paid for the boost gets a `paid_unlock_passed`
  // notification so they know their slot was consumed. Without this
  // the trade has no signal at all — silence after paying £9.99 is
  // the worst possible UX.
  it("fires a paid_unlock_passed notification when homeowner left-swipes a paid_unlock row", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "u1" }]) // project
      .mockResolvedValueOnce([{ user_id: "b1" }]) // builder exists
      // Existing row has source=paid_unlock so the route can branch on it
      .mockResolvedValueOnce([
        { source: "paid_unlock", homeowner_swiped_at: null },
      ])
      .mockResolvedValueOnce({ affectedRows: 1 }) // UPSERT swipe_interest
      // homeowner firstName lookup
      .mockResolvedValueOnce([{ firstName: "Chris" }])
      // project name lookup
      .mockResolvedValueOnce([{ name: "Kitchen remodel" }])
      // resolveGhostNotificationTarget — return empty so it falls
      // back to the builder uid itself (non-ghost)
      .mockResolvedValueOnce([])
      // INSERT INTO notifications
      .mockResolvedValueOnce({ affectedRows: 1 });
    const broadcastNotification = vi.fn();
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      broadcastNotification,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "left", source: "paid_unlock" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    // Find the INSERT INTO notifications call — it should carry the
    // paid_unlock_passed type and a "passed on your unlock" message.
    const notifInsert = q.mock.calls.find(
      ([sql]) =>
        typeof sql === "string" &&
        /INSERT\s+INTO\s+notifications/i.test(sql) &&
        /paid_unlock_passed/.test(sql),
    );
    expect(notifInsert).toBeDefined();
    // The bound params include the message; assert it has the expected
    // shape.
    const params = notifInsert![1] as any[];
    expect(params.some((p) => /passed on your unlock/i.test(String(p)))).toBe(
      true,
    );
    // And the broadcast event fires for live UI updates.
    expect(broadcastNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "paid_unlock_passed" }),
    );
  });

  // Regression: when the homeowner right-swipes on a RECOMMENDED trade
  // (who is passive — recommender did the posting, trade did nothing),
  // the trade must get a `homeowner_swiped` notification so they know
  // to check /tradesman/leads. Earlier the route only fired for
  // source='subscribed' and silently skipped recommended swipes, which
  // is arguably the highest-quality lead in the system.
  it("fires homeowner_swiped notification on right-swipe of a recommended trade (first-mover)", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "u1" }]) // project
      .mockResolvedValueOnce([{ user_id: "b1" }]) // builder exists
      // No existing row — homeowner is initiating
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 }) // UPSERT
      // homeowner firstName lookup for the notification body
      .mockResolvedValueOnce([{ firstName: "Chris" }])
      .mockResolvedValueOnce([{ name: "Loft insulation" }])
      .mockResolvedValueOnce([]) // resolveGhostNotificationTarget
      .mockResolvedValueOnce({ affectedRows: 1 }) // INSERT notification
      // Match-formation rowCheck — return state where builder hasn't
      // swiped + isn't a ghost, so fireMatchFormed doesn't fire.
      .mockResolvedValueOnce([
        { status: "pending", builder_swiped_at: null, builderMasterUid: null },
      ]);
    const broadcastNotification = vi.fn();
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      broadcastNotification,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "right", source: "recommended" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const notifInsert = q.mock.calls.find(
      ([sql]) =>
        typeof sql === "string" &&
        /INSERT\s+INTO\s+notifications/i.test(sql) &&
        /homeowner_swiped/.test(sql),
    );
    expect(notifInsert).toBeDefined();
    expect(broadcastNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "homeowner_swiped" }),
    );
  });

  it("records declined_by_homeowner on left-swipe", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, ownerUserId: "u1" }])
      .mockResolvedValueOnce([{ user_id: "b1" }])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler(
      {
        user: { uid: "u1" },
        params: { id: "1" },
        body: { builderUid: "b1", direction: "left", source: "subscribed" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "declined_by_homeowner" }),
    );
  });
});
