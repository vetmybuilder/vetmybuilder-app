import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const inboxMount = require("../../server/routes/recommendations/inbox.get.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  inboxMount(
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

describe("GET /api/recommendations/inbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns both linked and unlinked recs (no IS NULL filter on linked_tradesman_uid)", async () => {
    const q = vi
      .fn()
      // First call: rec rows
      .mockResolvedValueOnce([
        {
          recommendationId: 11,
          projectId: 100,
          projectName: "Kitchen extension",
          company: "Off Platform Builds Ltd",
          linkedTradesmanUid: null,
          isAnonymous: 0,
          recommenderRawName: "Alex Jones",
          createdAt: "2026-04-01T10:00:00Z",
          recommenderFirstName: "Alex",
          rating: 5,
          comment: "Tidy team and finished early.",
          qualityRating: 5,
          reliabilityRating: 5,
          communicationRating: 4,
          trustRating: 5,
          valueRating: 4,
          tradesmanCompanyName: null,
          tradesmanPhotoUrl: null,
          tradesmanTradeTypes: null,
        },
        {
          recommendationId: 12,
          projectId: 100,
          projectName: "Kitchen extension",
          company: "Joined Builds Ltd",
          linkedTradesmanUid: "trades-uid-2",
          isAnonymous: 0,
          recommenderRawName: "Sam Patel",
          createdAt: "2026-04-02T10:00:00Z",
          recommenderFirstName: "Sam",
          rating: 4,
          comment: null,
          qualityRating: 4,
          reliabilityRating: 4,
          communicationRating: 5,
          trustRating: 4,
          valueRating: 4,
          tradesmanCompanyName: "Joined Builds Ltd",
          tradesmanPhotoUrl: "https://cdn/joined.jpg",
          tradesmanTradeTypes: "Building,Plastering",
        },
      ])
      // Second call: photo lookup
      .mockResolvedValueOnce([
        { recommendationId: 11, filePath: "uploads/cover-a.jpg" },
        { recommendationId: 11, filePath: "uploads/extra-a.jpg" },
      ]);

    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "ho-1" } }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(2);

    const unlinked = body.items.find((i: any) => i.recommendationId === 11);
    expect(unlinked).toBeDefined();
    expect(unlinked.kind).toBe("recommendation");
    expect(unlinked.linkedTradesmanUid).toBeNull();
    expect(unlinked.companyName).toBe("Off Platform Builds Ltd");
    expect(unlinked.recommenderName).toBe("Alex");
    expect(unlinked.rating).toBe(5);
    expect(unlinked.comment).toBe("Tidy team and finished early.");
    expect(unlinked.ratings).toEqual({
      quality: 5,
      reliability: 5,
      communication: 4,
      trust: 5,
      value: 4,
    });
    expect(unlinked.photoUrls).toHaveLength(2);
    expect(unlinked.coverPhotoUrl).toContain("cover-a.jpg");

    const linked = body.items.find((i: any) => i.recommendationId === 12);
    expect(linked).toBeDefined();
    expect(linked.kind).toBe("recommendation");
    expect(linked.linkedTradesmanUid).toBe("trades-uid-2");
    expect(linked.companyName).toBe("Joined Builds Ltd");
    expect(linked.tradeTypes).toBe("Building,Plastering");
    // No own photos -> falls back to tradesman avatar for cover; photoUrls empty.
    expect(linked.photoUrls).toEqual([]);
    expect(linked.coverPhotoUrl).toBe("https://cdn/joined.jpg");
  });

  it("query excludes dismissed and homeowner-unfavourited recs", async () => {
    const q = vi.fn().mockResolvedValueOnce([]);
    const handler = loadHandler({
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery: q,
    });
    const res = mockRes();
    await handler({ user: { uid: "ho-1" } }, res);

    expect(q).toHaveBeenCalledTimes(1);
    const sql: string = q.mock.calls[0][0];
    expect(sql).toMatch(/deck_dismissed_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/homeowner_unfavourited_at\s+IS\s+NULL/i);
  });
});
