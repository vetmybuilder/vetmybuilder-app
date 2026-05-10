import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mount = require("../../server/routes/projects/preview-matches.get.js");

function loadHandler(ctx: any) {
  let captured: any = null;
  mount(
    {
      get: (_p: string, h: any) => {
        captured = h;
      },
    },
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

describe("GET /api/projects/preview-matches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400s when type is missing", async () => {
    const handler = loadHandler({ mysqlQuery: vi.fn() });
    const res = mockRes();
    await handler({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns local matches when supply is healthy", async () => {
    const localRows = [
      {
        user_id: "uid-1",
        public_id: "pub-1",
        company_name: "Elegant Building Services",
        trade_types: "Builder, Bathroom",
        service_areas: "E4, E17",
        profile_picture_url: "uploads/elegant.jpg",
        about: "Specialise in full bathroom strip-outs and tiling. Tidy team.",
        vmb_score: 85,
        rec_count: 12,
        avg_rating: 4.8,
      },
      {
        user_id: "uid-2",
        public_id: "pub-2",
        company_name: "Brightspark Bathrooms",
        trade_types: "Bathroom fitter",
        service_areas: "E17",
        profile_picture_url: null,
        about: null,
        vmb_score: 80,
        rec_count: 8,
        avg_rating: 4.7,
      },
      {
        user_id: "uid-3",
        public_id: "pub-3",
        company_name: "E4 Home Renovations",
        trade_types: "Builder",
        service_areas: "E4",
        profile_picture_url: "https://cdn/e4.jpg",
        about: "All trades in-house.",
        vmb_score: 78,
        rec_count: 15,
        avg_rating: 4.9,
      },
    ];

    const q = vi.fn().mockResolvedValueOnce(localRows);
    const handler = loadHandler({ mysqlQuery: q });
    const res = mockRes();

    await handler(
      { query: { type: "bathroom refit", location: "E4 9AB" } },
      res,
    );

    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(3);
    expect(body.items.every((i: any) => i.isLocal === true)).toBe(true);
    expect(body.items[0]).toMatchObject({
      id: "pub-1",
      company: "Elegant Building Services",
      rating: 4.8,
      reviewCount: 12,
    });
    expect(body.items[0].blurb).toContain("strip-outs");
    expect(body.items[2].photoUrl).toBe("https://cdn/e4.jpg");
  });

  it("pads with non-local trades when local supply is thin", async () => {
    const q = vi
      .fn()
      // local pass returns only 1
      .mockResolvedValueOnce([
        {
          user_id: "uid-1",
          public_id: "pub-1",
          company_name: "Local One",
          trade_types: "Builder",
          service_areas: "E4",
          profile_picture_url: null,
          about: null,
          vmb_score: 70,
          rec_count: 2,
          avg_rating: null,
        },
      ])
      // pad pass returns the local one again + 2 nearby
      .mockResolvedValueOnce([
        {
          user_id: "uid-1",
          public_id: "pub-1",
          company_name: "Local One",
          trade_types: "Builder",
          service_areas: "E4",
          profile_picture_url: null,
          about: null,
          vmb_score: 70,
          rec_count: 2,
          avg_rating: null,
        },
        {
          user_id: "uid-9",
          public_id: "pub-9",
          company_name: "Nearby Two",
          trade_types: "Builder",
          service_areas: "N9",
          profile_picture_url: null,
          about: null,
          vmb_score: 60,
          rec_count: 1,
          avg_rating: null,
        },
        {
          user_id: "uid-10",
          public_id: "pub-10",
          company_name: "Nearby Three",
          trade_types: "Builder",
          service_areas: "IG8",
          profile_picture_url: null,
          about: null,
          vmb_score: 55,
          rec_count: 0,
          avg_rating: null,
        },
      ]);

    const handler = loadHandler({ mysqlQuery: q });
    const res = mockRes();

    await handler({ query: { type: "Builder", location: "E4 1AA" } }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toMatchObject({ id: "pub-1", isLocal: true });
    expect(body.items[1]).toMatchObject({ id: "pub-9", isLocal: false });
    expect(body.items[2]).toMatchObject({ id: "pub-10", isLocal: false });
  });

  it("works without a location (skips local pass, returns up to 3 by score)", async () => {
    const q = vi.fn().mockResolvedValueOnce([
      {
        user_id: "uid-a",
        public_id: "pub-a",
        company_name: "Top Builder",
        trade_types: "Builder",
        service_areas: "E1",
        profile_picture_url: null,
        about: null,
        vmb_score: 90,
        rec_count: 20,
        avg_rating: 4.9,
      },
    ]);
    const handler = loadHandler({ mysqlQuery: q });
    const res = mockRes();

    await handler({ query: { type: "Builder" } }, res);

    expect(q).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(1);
    expect(body.items[0].isLocal).toBe(false);
  });
});
