import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

const fakeAuth = (req: any, _res: any, next: any) => {
  req.user = { uid: req.headers["x-test-uid"] || "owner-uid" };
  next();
};

function buildApp(mysqlQuery: ReturnType<typeof vi.fn>) {
  const app = express();
  app.use(express.json());
  const route = require("../../server/routes/tradesmen/favourites.get");
  route(app, { auth: fakeAuth, mysqlQuery, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } });
  return app;
}

describe("GET /api/tradesmen/favourites — recommendation items", () => {
  it("appends active recs from the homeowner's projects with kind=recommendation", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      // favourite_tradesmen → empty (no saved tradesmen)
      if (/FROM\s+favourite_tradesmen/i.test(sql)) return [];
      // information_schema photo table lookup
      if (/information_schema/i.test(sql)) return [];
      // recommendations query
      if (/FROM\s+recommendations\s+r/i.test(sql) && /JOIN\s+projects\s+p/i.test(sql) && /deck_dismissed_at/i.test(sql)) {
        return [
          {
            recommendationId: 83,
            projectId: 3,
            company: "Trade Kitchens",
            linked_tradesman_uid: null,
            isAnonymous: 0,
            recommenderName: "chris mike morris",
            recommenderFirstName: "chris",
            coverPhoto: "/uploads/kitchen.jpg",
            tradesmanCompanyName: null,
            tradesmanPhotoUrl: null,
            tradesmanTradeTypes: null,
          },
        ];
      }
      return [];
    });

    const app = buildApp(mysqlQuery);
    const res = await request(app)
      .get("/tradesmen/favourites")
      .set("x-test-uid", "owner-uid");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      kind: "recommendation",
      recommendationId: 83,
      projectId: 3,
      companyName: "Trade Kitchens",
      recommenderName: "chris",
      isFavourite: true,
    });
    expect(res.body.items[0].coverPhotoUrl).toContain("kitchen.jpg");
  });

  it("returns recs before tradesman items (priority placement)", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM\s+favourite_tradesmen/i.test(sql)) {
        return [
          {
            builderId: "builder-1",
            publicId: "pub-1",
            company_name: "London Bathroom Co",
            contact_name: "Bob",
            vmb_score: 60,
            vmb_badge: "PLATINUM",
            web_url: null,
            service_areas: null,
            subscription_status: "spotlight",
            plan: "spotlight",
            purchased_plan: null,
            wins_count: 5,
            photo_count: 10,
            likes_count: 3,
            trade_types: "Bathroom",
            status: "active",
            google_rating: 4.8,
            google_reviews_count: 20,
            ch_status: "verified",
            fav_created_at: new Date(),
          },
        ];
      }
      if (/information_schema/i.test(sql)) return [];
      // rec back-link query (for tradesman items)
      if (/FROM\s+recommendations\s+r/i.test(sql) && /linked_tradesman_uid\s+IN/i.test(sql)) return [];
      // active recs query
      if (/FROM\s+recommendations\s+r/i.test(sql) && /deck_dismissed_at/i.test(sql)) {
        return [
          {
            recommendationId: 83,
            projectId: 3,
            company: "Trade Kitchens",
            linked_tradesman_uid: null,
            isAnonymous: 0,
            recommenderName: null,
            recommenderFirstName: "Alex",
            coverPhoto: null,
            tradesmanCompanyName: null,
            tradesmanPhotoUrl: null,
            tradesmanTradeTypes: null,
          },
        ];
      }
      return [];
    });

    const app = buildApp(mysqlQuery);
    const res = await request(app)
      .get("/tradesmen/favourites")
      .set("x-test-uid", "owner-uid");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    // Rec should be first
    expect(res.body.items[0].kind).toBe("recommendation");
    expect(res.body.items[1].kind).toBe("tradesman");
  });

  it("marks tradesman items with kind=tradesman", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM\s+favourite_tradesmen/i.test(sql)) {
        return [
          {
            builderId: "builder-1",
            publicId: "pub-1",
            company_name: "Ace Builders",
            contact_name: "Tim",
            vmb_score: 40,
            vmb_badge: null,
            web_url: null,
            service_areas: null,
            subscription_status: "free",
            plan: "free",
            purchased_plan: null,
            wins_count: 2,
            photo_count: 3,
            likes_count: 1,
            trade_types: "General",
            status: "active",
            google_rating: null,
            google_reviews_count: null,
            ch_status: null,
            fav_created_at: new Date(),
          },
        ];
      }
      if (/information_schema/i.test(sql)) return [];
      if (/FROM\s+recommendations\s+r/i.test(sql)) return [];
      return [];
    });

    const app = buildApp(mysqlQuery);
    const res = await request(app)
      .get("/tradesmen/favourites")
      .set("x-test-uid", "owner-uid");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].kind).toBe("tradesman");
  });

  it("uses Anonymous when rec is anonymous", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM\s+favourite_tradesmen/i.test(sql)) return [];
      if (/information_schema/i.test(sql)) return [];
      if (/FROM\s+recommendations\s+r/i.test(sql) && /deck_dismissed_at/i.test(sql)) {
        return [
          {
            recommendationId: 91,
            projectId: 5,
            company: "Silent Co",
            linked_tradesman_uid: null,
            isAnonymous: 1,
            recommenderName: "Real Name",
            recommenderFirstName: "Real",
            coverPhoto: null,
            tradesmanCompanyName: null,
            tradesmanPhotoUrl: null,
            tradesmanTradeTypes: null,
          },
        ];
      }
      return [];
    });

    const app = buildApp(mysqlQuery);
    const res = await request(app)
      .get("/tradesmen/favourites")
      .set("x-test-uid", "owner-uid");

    expect(res.status).toBe(200);
    expect(res.body.items[0].recommenderName).toBe("Anonymous");
  });

  it("returns empty array when both tables are empty", async () => {
    const mysqlQuery = vi.fn(async (sql: string) => {
      if (/FROM\s+favourite_tradesmen/i.test(sql)) return [];
      if (/information_schema/i.test(sql)) return [];
      if (/FROM\s+recommendations/i.test(sql)) return [];
      return [];
    });

    const app = buildApp(mysqlQuery);
    const res = await request(app)
      .get("/tradesmen/favourites")
      .set("x-test-uid", "owner-uid");

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});
