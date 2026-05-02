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

describe("GET /api/tradesmen/favourites", () => {
  // The "active recommendations surfaced as kind=recommendation rows"
  // behaviour was moved out of this endpoint and into the dedicated
  // /api/recommendations/inbox route. Three tests that exercised the
  // old shape (priority placement, anonymous rec name fallback, basic
  // append) were removed when the behaviour moved.

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
