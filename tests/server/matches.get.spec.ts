import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const matchesMount = require("../../server/routes/projects/matches.get.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  matchesMount(
    { get: (_p: string, _a: any, h: any) => { captured = h; } },
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

describe("GET /api/projects/:id/matches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authed", async () => {
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: vi.fn(),
    });
    const res = mockRes();
    await handler({ user: null, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 403 when the user is not the project owner", async () => {
    const q = vi
      .fn()
      // expireSwipeInterests fires TWO UPDATEs (standard 14-day pass +
      // paid_unlock boost-expiry pass) before the route's own queries run.
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE 1 (standard)
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE 2 (paid_unlock)
      .mockResolvedValueOnce([
        { id: 1, ownerUserId: "someone-else", location: "E4 7ER" },
      ]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns split deck (recommended + subscribed) excluding swiped pairs", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE 1 (standard)
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE 2 (paid_unlock)
      .mockResolvedValueOnce([
        { id: 1, ownerUserId: "u1", location: "E4 7ER" },
      ]) // project
      .mockResolvedValueOnce([
        {
          structured: JSON.stringify({
            type: "kitchen",
            recommended_trades: ["kitchen_fitter"],
            price_band_estimate: "5000-10000",
          }),
        },
      ]) // classification
      .mockResolvedValueOnce([{ builder_uid: "already-swiped" }]) // swiped exclusion
      .mockResolvedValueOnce([
        {
          user_id: "rec1",
          company_name: "Rec Co",
          trade_types: "kitchen_fitter,plumber",
          service_areas: "E4,E10",
          vmb_score: 50,
          photoUrl: "https://cdn/x.jpg",
          starRating: 4.7,
          reviewCount: 23,
          yearsTrading: 9,
          chStatus: "matched",
          cvStatus: null,
          recommenderUserId: "alex-uid",
          recommendationId: 4242,
        },
      ]) // recommendations
      .mockResolvedValueOnce([
        {
          user_id: "sub1",
          company_name: "Sub Co",
          trade_types: "kitchen_fitter",
          service_areas: "E4",
          vmb_score: 60,
          photoUrl: null,
          starRating: null,
          reviewCount: 0,
          yearsTrading: 3,
          chStatus: null,
          cvStatus: "verified",
        },
      ]) // subscribed pool
      // paid_unlock boosted slots (added by the boost feature). Empty
      // array means no trades have paid for a slot on this project.
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { uid: "alex-uid", firstName: "Alex" },
      ]); // recommender lookup
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];

    expect(body.recommended).toHaveLength(1);
    const rec = body.recommended[0];
    expect(rec.uid).toBe("rec1");
    expect(rec.displayName).toBe("Rec Co");
    expect(rec.companyName).toBe("Rec Co");
    expect(rec.photoUrl).toBe("https://cdn/x.jpg");
    expect(rec.starRating).toBe(4.7);
    expect(rec.reviewCount).toBe(23);
    expect(rec.yearsTrading).toBe(9);
    expect(rec.chVerified).toBe(true);
    expect(rec.tier).toBe("recommended");
    expect(rec.whyMatch).toMatch(/Recommended/);
    expect(rec.recommenderName).toBe("Alex");
    expect(rec.recommendationId).toBe(4242);
    // Internal-only fields used by rankBuilders are still emitted.
    expect(rec.primaryTrade).toBe("kitchen_fitter");
    expect(rec.secondaryTrades).toEqual(["plumber"]);
    expect(rec.serviceAreas).toEqual(["E4", "E10"]);

    expect(body.subscribed).toHaveLength(1);
    const sub = body.subscribed[0];
    expect(sub.uid).toBe("sub1");
    expect(sub.tier).toBe("ai-matched");
    expect(sub.whyMatch).toBe("Matched on area + trade");
    expect(sub.chVerified).toBe(true);
    expect(sub.starRating).toBeNull();
    expect(sub.reviewCount).toBe(0);
    expect(sub.yearsTrading).toBe(3);
    expect(sub.recommenderName).toBeUndefined();
    expect(sub.recommendationId).toBeNull();
  });

  it("returns unlinked off-platform recs as recommendationCards with linkedTradesmanUid null", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE 1 (standard)
      .mockResolvedValueOnce({ affectedRows: 0 }) // expiry UPDATE 2 (paid_unlock)
      .mockResolvedValueOnce([
        { id: 1, ownerUserId: "u1", location: "E4 7ER" },
      ]) // project
      .mockResolvedValueOnce([
        {
          structured: JSON.stringify({
            type: "kitchen",
            recommended_trades: ["kitchen_fitter"],
          }),
        },
      ]) // classification
      .mockResolvedValueOnce([]) // swiped exclusion
      .mockResolvedValueOnce([]) // recRows (no linked recs → recommender lookup skipped)
      .mockResolvedValueOnce([]) // subscribed pool
      .mockResolvedValueOnce([]) // paid_unlock boost slots
      .mockResolvedValueOnce([
        {
          recommendationId: 9001,
          company: "Off Platform Builds Ltd",
          recommenderUserId: "alex-uid",
          isAnonymous: 0,
          recommenderName: "Alex Jones",
          companyEmail: "hello@offplat.example",
          recPhone: "07000 000111",
          linked_tradesman_uid: null,
          recommenderFirstName: "Alex",
          coverPhoto: "uploads/cover.jpg",
          tradesmanUid: null,
          tradesmanCompanyName: null,
          tradesmanPhotoUrl: null,
          tradesmanPhone: null,
          tradesmanEmail: null,
        },
      ]); // recCardRows (the unlinked off-platform rec)
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "u1" }, params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];

    expect(body.recommended).toEqual([]);
    expect(body.subscribed).toEqual([]);
    expect(body.recommendationCards).toHaveLength(1);
    const card = body.recommendationCards[0];
    expect(card.recommendationId).toBe(9001);
    expect(card.company).toBe("Off Platform Builds Ltd");
    expect(card.recommenderName).toBe("Alex");
    expect(card.linkedTradesmanUid).toBeNull();
    expect(card.coverPhotoUrl).toBe("uploads/cover.jpg");
    expect(card.contact.phone).toBe("07000 000111");
    expect(card.contact.email).toBe("hello@offplat.example");
  });
});
