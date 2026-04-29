// tests/server/projects-post-broadcast.spec.ts
//
// Smoke tests for the new_project_match SSE broadcast triggered when a new
// project is posted and notifyMatchedTradesmen runs.
//
// Strategy: import notifyMatchedTradesmen directly and invoke it with a mock
// mysqlQuery that returns a tradesman with a matching trade. Assert that
// broadcastEvent was called for that tradesman with the expected event name
// and payload shape.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../server/lib/pushSender.js", () => ({
  sendPushToUser: vi.fn(),
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// ─── notifyMatchedTradesmen ───────────────────────────────────────────────────

describe("notifyMatchedTradesmen → broadcastEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls broadcastEvent with new_project_match for a matching tradesman", async () => {
    const { notifyMatchedTradesmen } = require("../../server/lib/ai/notifyMatchedTradesmen.js");

    const broadcastEvent = vi.fn();

    // classification lookup returns recommended_trades
    const classificationRow = [
      { structured: JSON.stringify({ recommended_trades: ["plumbing", "tiling"] }) },
    ];
    // active tradesmen
    const tradesmenRows = [
      { user_id: "t-uid-1", trade_types: "plumbing,gas", service_areas: "E4,E17,N9" },
      { user_id: "t-uid-2", trade_types: "painting", service_areas: "E4" }, // no matching trade
    ];

    const mysqlQuery = vi
      .fn()
      .mockResolvedValueOnce(classificationRow) // SELECT structured FROM project_classifications
      .mockResolvedValueOnce(tradesmenRows)      // SELECT user_id, trade_types, service_areas FROM tradesmen
      .mockResolvedValue({});                    // INSERT notifications (per matched tradesman)

    await notifyMatchedTradesmen({
      mysqlQuery,
      projectId: 42,
      projectName: "Bathroom renovation",
      projectType: "plumbing",
      projectLocation: "E4",
      projectCreatedAt: new Date(),
      broadcastEvent,
      log: makeLog(),
    });

    // broadcastEvent should have been called exactly once (for t-uid-1 only)
    expect(broadcastEvent).toHaveBeenCalledOnce();
    const [uid, eventName, payload] = broadcastEvent.mock.calls[0];
    expect(uid).toBe("t-uid-1");
    expect(eventName).toBe("new_project_match");
    expect(payload.projectId).toBe(42);
    expect(payload.projectType).toBe("plumbing");
    expect(payload.location).toBe("E4");
  });

  it("does not call broadcastEvent when no tradesmen match the trade", async () => {
    const { notifyMatchedTradesmen } = require("../../server/lib/ai/notifyMatchedTradesmen.js");

    const broadcastEvent = vi.fn();

    const classificationRow = [
      { structured: JSON.stringify({ recommended_trades: ["roofing"] }) },
    ];
    const tradesmenRows = [
      { user_id: "t-uid-3", trade_types: "painting", service_areas: "E4" },
    ];

    const mysqlQuery = vi
      .fn()
      .mockResolvedValueOnce(classificationRow)
      .mockResolvedValueOnce(tradesmenRows)
      .mockResolvedValue({});

    await notifyMatchedTradesmen({
      mysqlQuery,
      projectId: 99,
      projectName: "Roof repair",
      projectType: "roofing",
      projectLocation: "E4",
      projectCreatedAt: new Date(),
      broadcastEvent,
      log: makeLog(),
    });

    expect(broadcastEvent).not.toHaveBeenCalled();
  });

  it.todo("smoke: POST /api/projects triggers broadcastEvent for matched subscribed tradesman (integration)");
});
