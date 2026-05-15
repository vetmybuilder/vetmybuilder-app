// tests/server/projects.post.pilotProjectTypeGate.spec.ts
//
// Verifies the pilot project-type gate in POST /api/projects. Mirrors the
// borough-gate spec - the frontend filters the picker to enabled types but
// a stale/scripted client could still POST a disabled leaf, so the server
// must refuse it.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../server/lib/ai/projectClassifier", () => ({
  classifyProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/lib/publishNotifications", () => ({
  firePublishNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/lib/analytics", () => ({
  trackProjectCreated: vi.fn(),
}));

// Stub postcodes.io. The borough gate runs alongside the project-type
// gate; for these tests we always resolve to Waltham Forest so only the
// type gate is exercised.
const { mockResolveOutwardDistricts } = vi.hoisted(() => ({
  mockResolveOutwardDistricts: vi.fn(async () => ["Waltham Forest"]),
}));
vi.mock("../../server/lib/postcodesIo", () => ({
  resolveOutwardDistricts: mockResolveOutwardDistricts,
  resolvePostcodeDistrict: vi.fn(async () => null),
  clearPostcodesIoCache: vi.fn(),
}));

// Reset both pilot caches between tests and clear the bypass flag so the
// gate is actually exercised.
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../server/lib/pilotAreas").invalidateCache();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../server/lib/pilotProjectTypes").invalidateCache();
  delete process.env.PILOT_AREAS_BYPASS;
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

// Builds a mysqlQuery stub that:
// - reports Waltham Forest as the only enabled borough
// - reports the supplied enabled project-type rows
// - captures any project INSERT for assertion
function buildMysqlStub(enabledRows: Array<{ type_name: string; category: string }>) {
  const inserts: Array<{ sql: string; params: any[] }> = [];
  const fn = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
    if (/CREATE TABLE IF NOT EXISTS pilot_boroughs/.test(sql)) return [];
    if (/INSERT IGNORE INTO pilot_boroughs/.test(sql)) return [];
    if (/SELECT name, enabled FROM pilot_boroughs/.test(sql)) {
      return [{ name: "Waltham Forest", enabled: 1 }];
    }
    if (/CREATE TABLE IF NOT EXISTS pilot_project_types/.test(sql)) return [];
    if (/INSERT IGNORE INTO pilot_project_types/.test(sql)) return [];
    if (/SELECT type_name, category, enabled FROM pilot_project_types/.test(sql)) {
      return enabledRows.map((r) => ({
        type_name: r.type_name,
        category: r.category,
        enabled: 1,
      }));
    }
    if (/^\s*INSERT INTO projects/.test(sql)) {
      inserts.push({ sql, params });
      return { insertId: 1 };
    }
    if (/SELECT \* FROM projects WHERE id = \?/.test(sql)) {
      return [{ id: 1, name: "x", location: "E4" }];
    }
    return [];
  });
  return { fn, inserts };
}

const VALID_BODY = {
  name: "Bath swap",
  location: "E4",
  description: "Pull old bath, fit new",
  propertyType: "Semi-Detached",
  bedrooms: 3,
};

describe("POST /api/projects - pilot project-type gate", () => {
  it("rejects a leaf whose category is not enabled", async () => {
    // Only Bathroom is enabled. Posting a Kitchen leaf is refused.
    const { fn: mysqlQuery } = buildMysqlStub([
      { type_name: "Bathroom Remodel (Full)", category: "Bathroom" },
    ]);

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "u1" },
        body: { ...VALID_BODY, type: "Kitchen Remodel (Full)" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe("project_type_not_available");
    expect(payload.fieldErrors.type).toBeTruthy();
  });

  it("allows a leaf whose category is enabled", async () => {
    const { fn: mysqlQuery, inserts } = buildMysqlStub([
      { type_name: "Bathroom Remodel (Full)", category: "Bathroom" },
    ]);

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "u2" },
        body: { ...VALID_BODY, type: "Bathroom Remodel (Full)" },
      },
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(inserts.length).toBe(1);
  });

  it("rejects a leaf that is unknown to the catalog", async () => {
    // Even though Bathroom is enabled, a totally bogus type name has no
    // category mapping and should be refused.
    const { fn: mysqlQuery } = buildMysqlStub([
      { type_name: "Bathroom Remodel (Full)", category: "Bathroom" },
    ]);

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "u3" },
        body: { ...VALID_BODY, type: "Definitely Not A Real Trade" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe("project_type_not_available");
  });

  it("bypasses the gate when PILOT_AREAS_BYPASS=1", async () => {
    process.env.PILOT_AREAS_BYPASS = "1";
    // Empty enabled set - in normal operation this would refuse every
    // post, but the bypass flag short-circuits the gate.
    const { fn: mysqlQuery, inserts } = buildMysqlStub([]);

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "u4" },
        body: { ...VALID_BODY, type: "Kitchen Remodel (Full)" },
      },
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(inserts.length).toBe(1);
  });
});
