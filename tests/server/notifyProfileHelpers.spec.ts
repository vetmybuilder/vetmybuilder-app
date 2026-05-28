// tests/server/notifyProfileHelpers.spec.ts
//
// Unit tests for the two profile notification helpers. Both insert a
// notifications row, broadcast over SSE, and fire a web push. We mock
// pushSender so no real push is attempted.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock("../../server/lib/pushSender.js", () => ({
  sendPushToUser: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notifyProfileLive } = require("../../server/lib/notifyProfileLive.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notifyProfileEnquiry } = require("../../server/lib/notifyProfileEnquiry.js");

describe("notifyProfileLive", () => {
  it("inserts a profile_live notification, broadcasts, and pushes", async () => {
    const mysql = vi.fn().mockResolvedValue({});
    const broadcast = vi.fn();
    await notifyProfileLive({
      mysqlQuery: mysql,
      uid: "u_t",
      slug: "bobs-builders",
      broadcastNotification: broadcast,
    });

    const insert = mysql.mock.calls.find((c: any[]) => /INSERT INTO notifications/.test(c[0]));
    expect(insert).toBeTruthy();
    // userId, type, message, linkPath
    expect(insert[1][0]).toBe("u_t");
    expect(insert[1][1]).toBe("profile_live");
    expect(insert[1][3]).toBe("/t/bobs-builders");

    expect(broadcast).toHaveBeenCalledWith("u_t", expect.objectContaining({ type: "profile_live", linkPath: "/t/bobs-builders" }));
  });

  it("never throws even if the DB insert fails", async () => {
    const mysql = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(
      notifyProfileLive({ mysqlQuery: mysql, uid: "u_t", slug: "x" }),
    ).resolves.toBeUndefined();
  });
});

describe("notifyProfileEnquiry", () => {
  it("inserts an enquiry notification with the visitor details and pushes", async () => {
    const mysql = vi.fn().mockResolvedValue({});
    const broadcast = vi.fn();
    await notifyProfileEnquiry({
      mysqlQuery: mysql,
      tradespersonUid: "u_t",
      visitorName: "Jo Bloggs",
      visitorPhone: "07000",
      message: "Need a wall built",
      broadcastNotification: broadcast,
    });

    const insert = mysql.mock.calls.find((c: any[]) => /INSERT INTO notifications/.test(c[0]));
    expect(insert).toBeTruthy();
    expect(insert[1][0]).toBe("u_t");
    expect(insert[1][1]).toBe("profile_enquiry");
    // message includes visitor name + phone
    expect(insert[1][2]).toContain("Jo Bloggs");
    expect(insert[1][2]).toContain("07000");
    expect(insert[1][3]).toBe("/tradesman/leads");

    expect(broadcast).toHaveBeenCalledWith("u_t", expect.objectContaining({ type: "profile_enquiry" }));
  });

  it("never throws even if the DB insert fails", async () => {
    const mysql = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(
      notifyProfileEnquiry({
        mysqlQuery: mysql,
        tradespersonUid: "u_t",
        visitorName: "Jo",
        visitorPhone: "07000",
        message: "",
      }),
    ).resolves.toBeUndefined();
  });
});
