import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const sendInviteMock = vi.fn();

const fakeAuth = (req: any, _res: any, next: any) => {
  req.user = { uid: req.headers["x-test-uid"] || "owner-uid" };
  next();
};

beforeEach(() => sendInviteMock.mockReset());

function setupApp(rows: Record<string, any[]>) {
  const mysqlQuery = vi.fn(async (sql: string) => {
    if (/FROM\s+recommendations\s+r\s+JOIN\s+projects/i.test(sql)) return rows.recProject ?? [];
    if (/FROM\s+users/i.test(sql)) return rows.user ?? [];
    if (/FROM\s+recommendation_invites/i.test(sql)) return rows.invite ?? [];
    if (/UPDATE\s+recommendation_invites/i.test(sql)) return { affectedRows: 1 };
    return [];
  });
  const app = express();
  app.use(express.json());
  const route = require("../../server/routes/recommendations/nudge.post");
  route(app, { auth: fakeAuth, mysqlQuery, sendBuilderInviteEmail: sendInviteMock });
  return { app, mysqlQuery };
}

describe("POST /api/recommendations/:id/nudge", () => {
  it("re-sends the invite and increments nudgeCount", async () => {
    sendInviteMock.mockResolvedValue(true);
    const { app } = setupApp({
      recProject: [
        {
          recId: 80,
          company: "Hudson Tiling",
          companyEmail: "hello@hudsontiling.co.uk",
          ownerUserId: "owner-uid",
          location: "E4 7QH",
          recommenderUserId: "rec-uid",
          isAnonymous: 0,
        },
      ],
      user: [{ firstName: "Priya" }],
      invite: [{ lastNudgedAt: null, nudgeCount: 0 }],
    });

    const res = await request(app).post("/recommendations/80/nudge");
    expect(res.status).toBe(200);
    expect(sendInviteMock).toHaveBeenCalledTimes(1);
    const args = sendInviteMock.mock.calls[0][0];
    expect(args.recipientEmail).toBe("hello@hudsontiling.co.uk");
    expect(args.builderCompanyName).toBe("Hudson Tiling");
  });

  it("returns 429 when last nudge was within 24h", async () => {
    const { app } = setupApp({
      recProject: [{ recId: 80, ownerUserId: "owner-uid", companyEmail: "x@y.com", company: "X" }],
      user: [{ firstName: "Sam" }],
      invite: [{ lastNudgedAt: new Date(Date.now() - 60 * 60 * 1000), nudgeCount: 1 }],
    });

    const res = await request(app).post("/recommendations/80/nudge");
    expect(res.status).toBe(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(sendInviteMock).not.toHaveBeenCalled();
  });

  it("returns 403 if caller is not the project owner", async () => {
    const { app } = setupApp({
      recProject: [{ recId: 80, ownerUserId: "different-uid", companyEmail: "x@y.com", company: "X" }],
    });
    const res = await request(app).post("/recommendations/80/nudge");
    expect(res.status).toBe(403);
  });

  it("returns 400 if rec has no companyEmail", async () => {
    const { app } = setupApp({
      recProject: [{ recId: 80, ownerUserId: "owner-uid", companyEmail: null, company: "X" }],
    });
    const res = await request(app).post("/recommendations/80/nudge");
    expect(res.status).toBe(400);
  });
});
