// tests/server/projects.post.pilotGate.spec.ts
//
// Verifies the pilot-area gate in POST /api/projects. The frontend filters
// the autocomplete to enabled outwards but a stale or scripted client could
// still POST a banned postcode - the server must refuse it.
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

// classifyProject fires AI work in the background after the row is inserted;
// we stub it so the route doesn't try to hit the model in tests.
vi.mock("../../server/lib/ai/projectClassifier.js", () => ({
  classifyProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/lib/publishNotifications.js", () => ({
  firePublishNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/lib/analytics.js", () => ({
  trackProjectCreated: vi.fn(),
}));

// Stub postcodes.io so we don't hit the real network. Each test seeds
// the resolveOutwardDistricts return value before calling the route.
const { mockResolveOutwardDistricts } = vi.hoisted(() => ({
  mockResolveOutwardDistricts: vi.fn(async () => [] as string[]),
}));
vi.mock("../../server/lib/postcodesIo.js", () => ({
  resolveOutwardDistricts: mockResolveOutwardDistricts,
  resolvePostcodeDistrict: vi.fn(async () => null),
  clearPostcodesIoCache: vi.fn(),
}));

// Reset the in-process pilot cache between tests so getEnabledOutwardSet
// reflects whatever fake mysqlQuery says today.
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../server/lib/pilotAreas").invalidateCache();
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const projectsPost = require("../../server/routes/projects/projects.post.js");

type Handler = (req: any, res: any) => Promise<void>;

function loadRouteHandler(mysqlQuery: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    post: (_path: string, _auth: unknown, handler: Handler) => {
      captured = handler;
    },
  };
  const ctx = {
    auth: (_req: unknown, _res: unknown, next: any) => next(),
    mysqlQuery,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  projectsPost(fakeRouter, ctx);
  if (!captured) throw new Error("route handler not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const VALID_BODY = {
  name: "Bath swap",
  type: "Bathroom Installation",
  description: "Pull old bath, fit new",
  propertyType: "Semi-Detached",
  bedrooms: 3,
};

describe("POST /api/projects - pilot-area gate", () => {
  it("rejects when the postcode's admin_district is not in the enabled set", async () => {
    // Pilot DB: only Waltham Forest enabled.
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS pilot_boroughs/.test(sql)) return [];
      if (/INSERT IGNORE INTO pilot_boroughs/.test(sql)) return [];
      if (/SELECT name, enabled FROM pilot_boroughs/.test(sql)) {
        return [{ name: "Waltham Forest", enabled: 1 }];
      }
      return [];
    });

    // postcodes.io says SW10 is in Kensington and Chelsea.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // (use hoisted mockResolveOutwardDistricts directly)
    mockResolveOutwardDistricts.mockResolvedValueOnce(["Kensington and Chelsea"]);

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "u1" }, body: { ...VALID_BODY, location: "SW10" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe("location_not_in_pilot");
    expect(body.message).toMatch(/Waltham Forest/);
    expect(body.fieldErrors.location).toBeTruthy();
    expect(body.pilotBoroughs).toEqual(["Waltham Forest"]);
  });

  it("allows a postcode whose admin_district IS in the enabled set", async () => {
    const inserts: Array<{ sql: string; params: any[] }> = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/CREATE TABLE IF NOT EXISTS pilot_boroughs/.test(sql)) return [];
      if (/INSERT IGNORE INTO pilot_boroughs/.test(sql)) return [];
      if (/SELECT name, enabled FROM pilot_boroughs/.test(sql)) {
        return [{ name: "Waltham Forest", enabled: 1 }];
      }
      if (/^\s*INSERT INTO projects/.test(sql)) {
        inserts.push({ sql, params });
        return { insertId: 42 };
      }
      if (/SELECT \* FROM projects WHERE id = \?/.test(sql)) {
        return [{ id: 42, name: VALID_BODY.name, location: "E4" }];
      }
      return [];
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // (use hoisted mockResolveOutwardDistricts directly)
    mockResolveOutwardDistricts.mockResolvedValueOnce(["Waltham Forest"]);

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "u2" }, body: { ...VALID_BODY, location: "E4" } },
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(inserts.length).toBe(1);
  });

  it("allows an outward that spans multiple districts when ANY district is enabled", async () => {
    // SE9 covers both Greenwich (disabled) and Bromley (enabled).
    const inserts: Array<{ sql: string; params: any[] }> = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/CREATE TABLE IF NOT EXISTS pilot_boroughs/.test(sql)) return [];
      if (/INSERT IGNORE INTO pilot_boroughs/.test(sql)) return [];
      if (/SELECT name, enabled FROM pilot_boroughs/.test(sql)) {
        return [{ name: "Bromley", enabled: 1 }];
      }
      if (/^\s*INSERT INTO projects/.test(sql)) {
        inserts.push({ sql, params });
        return { insertId: 99 };
      }
      if (/SELECT \* FROM projects WHERE id = \?/.test(sql)) {
        return [{ id: 99, name: VALID_BODY.name, location: "SE9" }];
      }
      return [];
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // (use hoisted mockResolveOutwardDistricts directly)
    mockResolveOutwardDistricts.mockResolvedValueOnce(["Greenwich", "Bromley"]);

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "u4" }, body: { ...VALID_BODY, location: "SE9" } },
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(inserts.length).toBe(1);
  });

  it("formats the borough list nicely when multiple are enabled", async () => {
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS pilot_boroughs/.test(sql)) return [];
      if (/INSERT IGNORE INTO pilot_boroughs/.test(sql)) return [];
      if (/SELECT name, enabled FROM pilot_boroughs/.test(sql)) {
        return [
          { name: "Hackney", enabled: 1 },
          { name: "Waltham Forest", enabled: 1 },
        ];
      }
      return [];
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // (use hoisted mockResolveOutwardDistricts directly)
    mockResolveOutwardDistricts.mockResolvedValueOnce(["Kensington and Chelsea"]);

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      { user: { uid: "u3" }, body: { ...VALID_BODY, location: "SW10" } },
      res,
    );

    const body = res.json.mock.calls[0][0];
    expect(body.message).toMatch(/Hackney and Waltham Forest/);
  });
});
