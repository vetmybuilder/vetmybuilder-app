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
            recommenderName: "Priya Patel",
            isAnonymous: 0,
            companyEmail: "hello@hudsontiling.co.uk",
            sentToEmail: "hello@hudsontiling.co.uk",
            emailSentAt: new Date("2026-04-26"),
            nudgeCount: 0,
            lastNudgedAt: null,
          },
        ];
      if (/FROM\s+recommendation_photos/i.test(sql)) return [];
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
      invite: { sent: true, companyEmail: "hello@hudsontiling.co.uk", nudgeCount: 0 },
    });
    expect(res.body.items[0].photos).toEqual([]);
  });

  it("returns photos grouped by rec id", async () => {
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
            recommenderName: "Priya Patel",
            isAnonymous: 0,
            companyEmail: "hello@hudsontiling.co.uk",
            sentToEmail: "hello@hudsontiling.co.uk",
            emailSentAt: new Date("2026-04-26"),
            nudgeCount: 0,
            lastNudgedAt: null,
          },
        ];
      if (/FROM\s+recommendation_photos/i.test(sql))
        return [{ id: 1, recommendationId: 80, fp: "/uploads/abc.jpg" }];
      return [];
    });

    const app = express();
    app.use(express.json());
    const route = require("../../server/routes/projects/off-platform-recommendations.get");
    route(app, { auth: fakeAuth, mysqlQuery });

    const res = await request(app).get("/projects/3/off-platform-recommendations");
    expect(res.status).toBe(200);
    expect(res.body.items[0].photos).toHaveLength(1);
    expect(res.body.items[0].photos[0]).toMatchObject({ id: "1", url: "/uploads/abc.jpg" });
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

  it("falls back to first word of typed name when no user is joined", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM\s+projects/i.test(sql)) return [{ ownerUserId: "owner-uid" }];
      if (/FROM\s+recommendations\s+r/i.test(sql))
        return [
          {
            id: 91,
            company: "Trade Kitchens",
            companyEmail: "x@y.com",
            comment: null,
            createdAt: new Date(),
            quality_rating: 5,
            reliability_rating: 5,
            communication_rating: 5,
            trust_rating: 5,
            value_rating: 5,
            recommenderFirstName: null,
            recommenderName: "chris mike morris",
            isAnonymous: 0,
            linked_tradesman_uid: null,
            inviteId: null,
            sentToEmail: null,
            emailSentAt: null,
            nudgeCount: 0,
            lastNudgedAt: null,
            tradesmanPhotoUrl: null,
            tradesmanPhone: null,
            tradesmanEmail: null,
            tradesmanUid: null,
          },
        ];
      if (/FROM\s+recommendation_photos/i.test(sql)) return [];
      return [];
    });

    const app = express();
    app.use(express.json());
    const route = require("../../server/routes/projects/off-platform-recommendations.get");
    route(app, { auth: fakeAuth, mysqlQuery });

    const res = await request(app).get("/projects/3/off-platform-recommendations");
    expect(res.status).toBe(200);
    expect(res.body.items[0].recommender.name).toBe("chris");
  });

  it("returns claimed recs with tradesman contact details", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM\s+projects/i.test(sql)) return [{ ownerUserId: "owner-uid" }];
      if (/FROM\s+recommendations\s+r/i.test(sql))
        return [
          {
            id: 95,
            company: "Ace Plumbing",
            companyEmail: "ace@example.com",
            comment: "Brilliant work",
            createdAt: new Date("2026-04-26"),
            quality_rating: 5,
            reliability_rating: 5,
            communication_rating: null,
            trust_rating: null,
            value_rating: null,
            recommenderFirstName: "Samir",
            recommenderName: "Samir Khan",
            isAnonymous: 0,
            linked_tradesman_uid: "builder-uid-1",
            inviteId: 7,
            sentToEmail: "ace@example.com",
            emailSentAt: new Date("2026-04-20"),
            nudgeCount: 1,
            lastNudgedAt: null,
            tradesmanPhotoUrl: "/uploads/ace.jpg",
            tradesmanPhone: "07700900123",
            tradesmanEmail: "ace@example.com",
            tradesmanUid: "builder-uid-1",
          },
        ];
      if (/FROM\s+recommendation_photos/i.test(sql)) return [];
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
      id: 95,
      company: "Ace Plumbing",
      claimed: true,
      tradesman: {
        uid: "builder-uid-1",
        photoUrl: "/uploads/ace.jpg",
        phone: "07700900123",
        email: "ace@example.com",
      },
    });
  });

  it("returns unclaimed recs with claimed: false and tradesman: null", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM\s+projects/i.test(sql)) return [{ ownerUserId: "owner-uid" }];
      if (/FROM\s+recommendations\s+r/i.test(sql))
        return [
          {
            id: 96,
            company: "Fresh Tiles",
            companyEmail: "fresh@example.com",
            comment: null,
            createdAt: new Date("2026-04-25"),
            quality_rating: 4,
            reliability_rating: null,
            communication_rating: null,
            trust_rating: null,
            value_rating: null,
            recommenderFirstName: "Jo",
            recommenderName: "Jo Smith",
            isAnonymous: 0,
            linked_tradesman_uid: null,
            inviteId: 8,
            sentToEmail: "fresh@example.com",
            emailSentAt: new Date("2026-04-25"),
            nudgeCount: 0,
            lastNudgedAt: null,
            tradesmanPhotoUrl: null,
            tradesmanPhone: null,
            tradesmanEmail: null,
            tradesmanUid: null,
          },
        ];
      if (/FROM\s+recommendation_photos/i.test(sql)) return [];
      return [];
    });

    const app = express();
    app.use(express.json());
    const route = require("../../server/routes/projects/off-platform-recommendations.get");
    route(app, { auth: fakeAuth, mysqlQuery });

    const res = await request(app).get("/projects/3/off-platform-recommendations");
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      id: 96,
      claimed: false,
      tradesman: null,
    });
  });
});
