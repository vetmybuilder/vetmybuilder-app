import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/payments/activate-unlock.post.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  mount({ post: (_p: string, _a: any, h: any) => { captured = h; } }, ctx);
  if (!captured) throw new Error("handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("activate-unlock — inbox_messages insertion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts an inbox_messages row for unlock_contact sessions", async () => {
    // Call sequence in the handler:
    // 1. payments.getSession — mocked via ctx.payments
    // 2. SELECT project_contact_unlocks (existing check) → []
    // 3. INSERT project_contact_unlocks → { affectedRows: 1 }
    // 4. INSERT payments_oneoff → { affectedRows: 1 }
    // 5. SELECT ownerUserId FROM projects → [{ ownerUserId: "ho1" }]
    // 6. INSERT inbox_messages → { affectedRows: 1 }
    const q = vi.fn()
      .mockResolvedValueOnce([])                        // (2) existing unlock check
      .mockResolvedValueOnce({ affectedRows: 1 })       // (3) unlock insert
      .mockResolvedValueOnce({ affectedRows: 1 })       // (4) payments_oneoff insert
      .mockResolvedValueOnce([{ ownerUserId: "ho1" }])  // (5) project owner lookup
      .mockResolvedValueOnce({ affectedRows: 1 });      // (6) inbox_messages insert

    const ctx = {
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      payments: {
        getSession: vi.fn().mockResolvedValue({
          id: "sess_1",
          userId: "b1",
          metadata: {
            projectId: "42",
            buyerUid: "b1",
            introMessage: "Hi, I'd love to help with your kitchen.",
            vmb_type: "unlock_contact",
            type: "unlock_contact",
          },
        }),
        isStripe: false,
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      logActivity: vi.fn(),
    };

    const handler = loadHandler(ctx);
    const res = mockRes();
    await handler(
      { user: { uid: "b1" }, body: { sessionId: "sess_1", projectId: "42" } },
      res,
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));

    const inboxInsert = q.mock.calls.find(([sql]: [string]) =>
      /INSERT INTO inbox_messages/i.test(sql),
    );
    expect(inboxInsert).toBeTruthy();

    // Verify the parameters passed to the inbox INSERT
    const [, params] = inboxInsert as [string, any[]];
    expect(params).toEqual([
      42,       // project_id
      "ho1",    // homeowner_uid (from project lookup)
      "b1",     // builder_uid
      "Hi, I'd love to help with your kitchen.", // intro_message from metadata
    ]);
  });

  it("skips inbox insert when vmb_type is not unlock_contact", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 });

    const ctx = {
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      payments: {
        getSession: vi.fn().mockResolvedValue({
          id: "sess_2",
          userId: "b2",
          metadata: {
            projectId: "10",
            buyerUid: "b2",
            vmb_type: "spotlight",
            type: "spotlight",
          },
        }),
        isStripe: false,
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      logActivity: vi.fn(),
    };

    const handler = loadHandler(ctx);
    const res = mockRes();
    await handler(
      { user: { uid: "b2" }, body: { sessionId: "sess_2", projectId: "10" } },
      res,
    );

    const inboxInsert = q.mock.calls.find(([sql]: [string]) =>
      /INSERT INTO inbox_messages/i.test(sql),
    );
    expect(inboxInsert).toBeUndefined();
  });

  it("does not fail the activation if inbox insert throws", async () => {
    const q = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([{ ownerUserId: "ho2" }])
      .mockRejectedValueOnce(new Error("DB constraint error")); // inbox insert fails

    const ctx = {
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
      payments: {
        getSession: vi.fn().mockResolvedValue({
          id: "sess_3",
          userId: "b3",
          metadata: {
            projectId: "7",
            buyerUid: "b3",
            introMessage: "",
            vmb_type: "unlock_contact",
            type: "unlock_contact",
          },
        }),
        isStripe: false,
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      logActivity: vi.fn(),
    };

    const handler = loadHandler(ctx);
    const res = mockRes();
    await handler(
      { user: { uid: "b3" }, body: { sessionId: "sess_3", projectId: "7" } },
      res,
    );

    // The activation should still succeed even though inbox insert failed
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});
