// tests/server/chat-messages.spec.ts
//
// Unit tests for:
//   GET  /api/chat/:matchId/messages
//   POST /api/chat/:matchId/messages

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../server/lib/pushSender.js", () => ({
  sendPushToUser: vi.fn(),
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * Mounts a route module and returns all middleware in the chain for a given
 * HTTP method. Supports both (path, auth, handler) and (path, handler) forms.
 */
function captureMiddlewares(
  mountFn: (router: any, ctx: any) => void,
  ctx: any,
  method: "get" | "post",
): any[] {
  const middlewares: any[] = [];
  const router: any = {};
  router[method] = (_path: string, ...fns: any[]) => {
    middlewares.push(...fns);
  };
  mountFn(router, ctx);
  if (!middlewares.length) throw new Error("no middlewares captured");
  return middlewares;
}

/**
 * Run the full middleware chain and stop on first that doesn't call next().
 *
 * Defaults req.headers to {} so the multipart-detection middleware in
 * messages.post.js (which reads req.headers["content-type"]) doesn't
 * blow up under unit tests that only care about the JSON path.
 */
async function runChain(middlewares: any[], req: any, res: any) {
  if (!req.headers) req.headers = {};
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
          result.then(() => { if (!nextCalled) resolve(); }, reject);
        } else if (!nextCalled) {
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });
    if (!nextCalled) break;
  }
}

/** Minimal swipe_interest row for a matched pair. */
function matchRow(overrides: Record<string, any> = {}) {
  return [
    {
      matchId: 1,
      homeowner_uid: "hw1",
      builder_uid: "b1",
      status: "matched",
      project_id: 10,
      projectName: "Kitchen reno",
      homeownerFirstName: "Alice",
      builderCompanyName: "Ace Builders",
      builderFirstName: "Bob",
      ...overrides,
    },
  ];
}

function noAuthCtx(q: any) {
  return {
    auth: (_req: any, _res: any, next: any) => next(),
    mysqlQuery: q,
    broadcastNotification: vi.fn(),
    logActivity: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

// ─── GET /api/chat/:matchId/messages ─────────────────────────────────────────

describe("GET /api/chat/:matchId/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when match not found", async () => {
    const q = vi.fn().mockResolvedValueOnce([]); // no match row
    const mountGet = require("../../server/routes/chat/messages.get.js");
    const middlewares = captureMiddlewares(mountGet, noAuthCtx(q), "get");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "hw1" }, params: { matchId: "99" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when caller is not a party", async () => {
    const q = vi.fn().mockResolvedValueOnce(matchRow()); // match row
    const mountGet = require("../../server/routes/chat/messages.get.js");
    const middlewares = captureMiddlewares(mountGet, noAuthCtx(q), "get");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "outsider" }, params: { matchId: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 when status is pending", async () => {
    const q = vi.fn().mockResolvedValueOnce(matchRow({ status: "pending" }));
    const mountGet = require("../../server/routes/chat/messages.get.js");
    const middlewares = captureMiddlewares(mountGet, noAuthCtx(q), "get");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "hw1" }, params: { matchId: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns messages with correct senderRole for homeowner", async () => {
    const msgRows = [
      { id: 1, senderUid: "hw1", body: "Hello", createdAt: "2026-01-01T10:00:00Z" },
      { id: 2, senderUid: "b1",  body: "Hi",    createdAt: "2026-01-01T10:01:00Z" },
    ];
    const q = vi
      .fn()
      .mockResolvedValueOnce(matchRow()) // swipe_interest lookup
      .mockResolvedValueOnce(msgRows);   // chat_messages

    const mountGet = require("../../server/routes/chat/messages.get.js");
    const middlewares = captureMiddlewares(mountGet, noAuthCtx(q), "get");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "hw1" }, params: { matchId: "1" } }, res);

    expect(res.status).not.toHaveBeenCalled(); // 200 implied
    const payload = res.json.mock.calls[0][0];
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[0].senderRole).toBe("homeowner");
    expect(payload.messages[1].senderRole).toBe("tradesman");
    expect(payload.me.role).toBe("homeowner");
    expect(payload.otherParty.role).toBe("tradesman");
    expect(payload.otherParty.name).toBe("Ace Builders");
  });

  it("returns messages with correct senderRole for tradesman", async () => {
    const msgRows = [
      { id: 3, senderUid: "b1", body: "Hello", createdAt: "2026-01-01T10:00:00Z" },
    ];
    const q = vi
      .fn()
      .mockResolvedValueOnce(matchRow())
      .mockResolvedValueOnce(msgRows);

    const mountGet = require("../../server/routes/chat/messages.get.js");
    const middlewares = captureMiddlewares(mountGet, noAuthCtx(q), "get");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "b1" }, params: { matchId: "1" } }, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.messages[0].senderRole).toBe("tradesman");
    expect(payload.me.role).toBe("tradesman");
    expect(payload.otherParty.role).toBe("homeowner");
  });
});

// ─── POST /api/chat/:matchId/messages ────────────────────────────────────────

describe("POST /api/chat/:matchId/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for empty body", async () => {
    const q = vi.fn();
    const mountPost = require("../../server/routes/chat/messages.post.js");
    const middlewares = captureMiddlewares(mountPost, noAuthCtx(q), "post");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "hw1" }, params: { matchId: "1" }, body: { body: "" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 403 for non-party", async () => {
    const q = vi.fn().mockResolvedValueOnce(matchRow());
    const mountPost = require("../../server/routes/chat/messages.post.js");
    const middlewares = captureMiddlewares(mountPost, noAuthCtx(q), "post");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "stranger" }, params: { matchId: "1" }, body: { body: "Hi" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 when match status is pending", async () => {
    const q = vi.fn().mockResolvedValueOnce(matchRow({ status: "pending" }));
    const mountPost = require("../../server/routes/chat/messages.post.js");
    const middlewares = captureMiddlewares(mountPost, noAuthCtx(q), "post");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "hw1" }, params: { matchId: "1" }, body: { body: "Hi" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 when match status is declined_by_builder", async () => {
    const q = vi.fn().mockResolvedValueOnce(matchRow({ status: "declined_by_builder" }));
    const mountPost = require("../../server/routes/chat/messages.post.js");
    const middlewares = captureMiddlewares(mountPost, noAuthCtx(q), "post");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "hw1" }, params: { matchId: "1" }, body: { body: "Hi" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("POST then GET returns the message with correct senderRole", async () => {
    const insertedRow = { id: 42, senderUid: "hw1", body: "Hello!", createdAt: "2026-01-01T10:00:00Z" };
    const postQ = vi
      .fn()
      .mockResolvedValueOnce(matchRow())           // swipe_interest lookup
      .mockResolvedValueOnce({ insertId: 42 })     // INSERT chat_messages
      .mockResolvedValueOnce([insertedRow])         // SELECT by insertId
      .mockResolvedValueOnce({});                   // INSERT notifications

    const mountPost = require("../../server/routes/chat/messages.post.js");
    const middlewares = captureMiddlewares(mountPost, noAuthCtx(postQ), "post");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "hw1" }, params: { matchId: "1" }, body: { body: "Hello!" } }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const msg = res.json.mock.calls[0][0];
    expect(msg.senderRole).toBe("homeowner");
    expect(msg.senderUid).toBe("hw1");
    expect(msg.body).toBe("Hello!");
  });

  it("inserts inbox_message_new notification for the other party", async () => {
    const insertedRow = { id: 5, senderUid: "hw1", body: "Hey", createdAt: "2026-01-01T10:00:00Z" };
    let capturedNotifArgs: any = null;
    const q = vi
      .fn()
      .mockResolvedValueOnce(matchRow())
      .mockResolvedValueOnce({ insertId: 5 })
      .mockResolvedValueOnce([insertedRow])
      // Ghost-tradesman redirect lookup (master_uid). Empty result => no
      // redirect, recipient stays as the original builder uid.
      .mockResolvedValueOnce([])
      .mockImplementationOnce((_sql: string, args: any[]) => {
        capturedNotifArgs = args;
        return Promise.resolve({});
      });

    const mountPost = require("../../server/routes/chat/messages.post.js");
    const middlewares = captureMiddlewares(mountPost, noAuthCtx(q), "post");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "hw1" }, params: { matchId: "1" }, body: { body: "Hey" } }, res);

    // The notification INSERT should have been called with builder_uid as recipient
    expect(capturedNotifArgs).not.toBeNull();
    expect(capturedNotifArgs[0]).toBe("b1"); // recipient = builder
    expect(capturedNotifArgs[1]).toContain("Alice"); // senderName
  });

  it("calls broadcastEvent with chat_message for the OTHER party only (homeowner sends)", async () => {
    const insertedRow = { id: 7, senderUid: "hw1", body: "Test SSE", createdAt: "2026-01-01T10:00:00Z" };
    const broadcastEvent = vi.fn();
    const q = vi
      .fn()
      .mockResolvedValueOnce(matchRow())
      .mockResolvedValueOnce({ insertId: 7 })
      .mockResolvedValueOnce([insertedRow])
      .mockResolvedValueOnce({}); // notifications INSERT

    const ctx = {
      ...noAuthCtx(q),
      broadcastEvent,
    };

    const mountPost = require("../../server/routes/chat/messages.post.js");
    const middlewares = captureMiddlewares(mountPost, ctx, "post");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "hw1" }, params: { matchId: "1" }, body: { body: "Test SSE" } }, res);

    expect(broadcastEvent).toHaveBeenCalledOnce();
    const [uid, eventName, payload] = broadcastEvent.mock.calls[0];
    expect(uid).toBe("b1"); // recipient = builder (the OTHER party)
    expect(eventName).toBe("chat_message");
    expect(payload.matchId).toBe(1);
    expect(payload.message.senderUid).toBe("hw1");
    expect(payload.message.body).toBe("Test SSE");
  });

  it("calls broadcastEvent for the OTHER party when builder sends", async () => {
    const insertedRow = { id: 8, senderUid: "b1", body: "Builder reply", createdAt: "2026-01-01T10:05:00Z" };
    const broadcastEvent = vi.fn();
    const q = vi
      .fn()
      .mockResolvedValueOnce(matchRow())
      .mockResolvedValueOnce({ insertId: 8 })
      .mockResolvedValueOnce([insertedRow])
      .mockResolvedValueOnce({});

    const ctx = { ...noAuthCtx(q), broadcastEvent };
    const mountPost = require("../../server/routes/chat/messages.post.js");
    const middlewares = captureMiddlewares(mountPost, ctx, "post");
    const res = mockRes();
    await runChain(middlewares, { user: { uid: "b1" }, params: { matchId: "1" }, body: { body: "Builder reply" } }, res);

    expect(broadcastEvent).toHaveBeenCalledOnce();
    const [uid, eventName] = broadcastEvent.mock.calls[0];
    expect(uid).toBe("hw1"); // recipient = homeowner (the OTHER party)
    expect(eventName).toBe("chat_message");
  });
});
