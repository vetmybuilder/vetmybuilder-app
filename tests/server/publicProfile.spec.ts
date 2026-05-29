// tests/server/publicProfile.spec.ts
//
// GET /api/t/:slug - public tradesperson profile. No auth. Returns the
// profile only when status='active' AND profile_public=1.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const profileRoute = require("../../server/routes/public/profile.get.js");

function loadHandler(mysqlQuery: any) {
  const handlers: Record<string, (req: any, res: any) => Promise<void>> = {};
  const fakeRouter: any = {
    get: (path: string, handler: any) => {
      handlers[path] = handler;
    },
    post: () => {},
    patch: () => {},
    put: () => {},
    delete: () => {},
  };
  profileRoute(fakeRouter, { mysqlQuery });
  return handlers["/t/:slug"];
}

function mockRes() {
  const res: any = { __sent: false };
  res.status = vi.fn().mockImplementation(() => res);
  res.json = vi.fn().mockImplementation(() => {
    res.__sent = true;
    return res;
  });
  res.set = vi.fn().mockImplementation(() => res);
  return res;
}

const ACTIVE_PUBLIC = {
  user_id: "u_elegant",
  company_name: "Elegant Building Services Ltd",
  contact_name: "Adam",
  trade_types: "General Builder,Extension Builder",
  service_areas: "E4,E17",
  status: "active",
  profile_template: "extension-1",
  slug: "elegant-building-services",
  vmb_badge: "platinum",
  verification_status: "verified",
  company_number: "12758227",
  google_rating: 4.9,
  google_reviews_count: 137,
  profile_picture_url: null,
  about: "We build.",
  created_at: "2024-01-01T00:00:00.000Z",
  offers_discount: 1,
  warranty_months: 12,
  likes_count: 0,
  wins_count: 0,
  photo_count: 0,
};

beforeEach(() => {
  // Stub fetch so server-side geocoding never hits the network.
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ result: { latitude: 51.5, longitude: -0.02 } }),
  }) as any;
});

describe("GET /api/t/:slug", () => {
  it("returns 400 for an empty slug", async () => {
    const handler = loadHandler(vi.fn().mockResolvedValue([]));
    const res = mockRes();
    await handler({ params: { slug: "  " } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when no active+public row matches", async () => {
    const mysql = vi.fn().mockResolvedValue([]); // main lookup returns nothing
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler({ params: { slug: "ghost" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "not_found" }));
  });

  it("enforces status=active AND profile_public=1 in the query", async () => {
    const mysql = vi.fn().mockResolvedValue([]);
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler({ params: { slug: "elegant-building-services" } }, res);
    const sql = mysql.mock.calls[0][0];
    expect(sql).toMatch(/status\s*=\s*'active'/);
    expect(sql).toMatch(/profile_public\s*=\s*1/);
  });

  it("returns the shaped profile for an active+public tradesperson", async () => {
    const mysql = vi.fn().mockImplementation(async (sql: string) => {
      if (/FROM tradesmen t\s+WHERE t\.slug/.test(sql)) return [ACTIVE_PUBLIC];
      if (/tradesmen_photos/.test(sql)) return [{ url: "https://x/p1.jpg" }];
      if (/FROM recommendations/.test(sql)) return [];
      if (/FROM hires/.test(sql)) return [{ c: 3 }];
      return [];
    });
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler({ params: { slug: "elegant-building-services" } }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.company_name).toBe("Elegant Building Services Ltd");
    expect(body.slug).toBe("elegant-building-services");
    expect(body.template).toBe("extension-1");
    expect(body.google_rating).toBe(4.9);
    expect(body.photo_urls).toEqual(["https://x/p1.jpg"]);
    expect(body.hire_count).toBe(3);
    expect(Array.isArray(body.area_points)).toBe(true);
    // Must NOT leak internal fields
    expect(body.email).toBeUndefined();
    expect(body.phone).toBeUndefined();
    expect(body.status).toBeUndefined();
  });

  it("geocodes outward postcodes into area_points", async () => {
    const mysql = vi.fn().mockImplementation(async (sql: string) => {
      if (/FROM tradesmen t\s+WHERE t\.slug/.test(sql)) return [ACTIVE_PUBLIC];
      return [];
    });
    const handler = loadHandler(mysql);
    const res = mockRes();
    await handler({ params: { slug: "elegant-building-services" } }, res);
    const body = res.json.mock.calls[0][0];
    // E4 + E17 both resolve via the stubbed fetch
    expect(body.area_points.length).toBe(2);
    expect(body.area_points[0]).toMatchObject({ code: "E4", lat: 51.5, lng: -0.02 });
  });
});
