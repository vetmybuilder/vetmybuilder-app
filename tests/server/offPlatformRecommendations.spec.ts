import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

const fakeAuth = (req: any, _res: any, next: any) => {
  req.user = { uid: req.headers["x-test-uid"] || "owner-uid" };
  next();
};

describe("GET /api/projects/:id/off-platform-recommendations", () => {
  it("returns recs with linked_tradesman_uid IS NULL plus invite state", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM\s+projects/i.test(sql)) return [{ ownerUserId: "owner-uid" }];
      if (/FROM\s+recommendations\s+r/i.test(sql))
        return [
          {
            id: 80,
            company: "Hudson Tiling",
            comment: "Great team",
            createdAt: new Date("2026-04-26"),
            quality_rating: 5,
            reliability_rating: 4,
            communication_rating: null,
            trust_rating: null,
            value_rating: null,
            recommenderFirstName: "Priya",
            isAnonymous: 0,
            sentToEmail: "hello@hudsontiling.co.uk",
            emailSentAt: new Date("2026-04-26"),
            nudgeCount: 0,
            lastNudgedAt: null,
          },
        ];
      return [];
    });

    const app = express();
    app.use(express.json());
    const route = require("../../server/routes/projects/off-platform-recommendations.get");
    route(app, { auth: fakeAuth, mysqlQuery });

    const res = await request(app).get("/projects/3/off-platform-recommendations");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: 80,
      company: "Hudson Tiling",
      ratings: { quality: 5, reliability: 4 },
      recommender: { name: "Priya" },
      invite: { sent: true, nudgeCount: 0 },
    });
  });

  it("returns 403 if the caller is not the owner", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM\s+projects/i.test(sql)) return [{ ownerUserId: "different-uid" }];
      return [];
    });

    const app = express();
    const route = require("../../server/routes/projects/off-platform-recommendations.get");
    route(app, { auth: fakeAuth, mysqlQuery });

    const res = await request(app).get("/projects/3/off-platform-recommendations");
    expect(res.status).toBe(403);
  });

  it("returns 404 if the project does not exist", async () => {
    const mysqlQuery = vi.fn(async () => []);

    const app = express();
    const route = require("../../server/routes/projects/off-platform-recommendations.get");
    route(app, { auth: fakeAuth, mysqlQuery });

    const res = await request(app).get("/projects/999/off-platform-recommendations");
    expect(res.status).toBe(404);
  });
});
