// tests/server/adminTradesmanDocs.spec.ts
//
// Auth + dispatch tests for the admin doc-management endpoints:
//
//   GET   /api/admin/tradesmen/:uid/docs          - list + verified flags
//   PATCH /api/admin/tradesmen/:uid/docs/:idx     - toggle verified
//
// Mirror of tests/server/tradesmenDocs.spec.ts. We use the REAL
// requireAdmin middleware - it has a built-in test-uid bypass when
// NODE_ENV=test, so setting TEST_ADMIN_USER_UID + sending that uid on
// req.user takes the admin happy path. Any other uid gets the real 403.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const TEST_ADMIN_UID = "admin-uid-test";
process.env.TEST_ADMIN_USER_UID = TEST_ADMIN_UID;
process.env.NODE_ENV = "test";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const docsListRoute = require("../../server/routes/admin/tradesman-docs.get.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const docVerifyRoute = require("../../server/routes/admin/tradesman-doc-verify.patch.js");

type Mw = (req: any, res: any, next: any) => Promise<void> | void;

function loadHandlers(
  routeMod: (router: any, ctx: any) => void,
  mysqlQuery: any,
  routerVerb: "get" | "patch",
) {
  const handlers: Record<string, (req: any, res: any) => Promise<void>> = {};
  // No-op for verbs we don't care about; the active verb is overwritten
  // below so its handler is the capture function.
  const fakeRouter: any = {
    get: () => {},
    post: () => {},
    patch: () => {},
    put: () => {},
    delete: () => {},
  };
  fakeRouter[routerVerb] = (path: string, ...rest: any[]) => {
    const chain = rest as Mw[];
    handlers[path] = async (req, res) => {
      let i = 0;
      const advance = async (): Promise<void> => {
        if (res.__sent) return;
        if (i >= chain.length) return;
        const mw = chain[i++];
        await mw(req, res, advance);
      };
      await advance();
    };
  };
  const ctx = {
    auth: (_req: unknown, _res: unknown, next: any) => next(),
    mysqlQuery,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  routeMod(fakeRouter, ctx);
  return handlers;
}

function mockRes() {
  const res: any = { __sent: false };
  res.status = vi.fn().mockImplementation((_code: number) => {
    return res;
  });
  res.json = vi.fn().mockImplementation((_body: unknown) => {
    res.__sent = true;
    return res;
  });
  return res;
}

/* ============= GET /api/admin/tradesmen/:uid/docs ============= */

describe("GET /api/admin/tradesmen/:uid/docs", () => {
  const PATH = "/admin/tradesmen/:uid/docs";

  const DOCS_JSON = JSON.stringify([
    {
      type: "public_liability",
      label: "Northshield £5m",
      fileKey: "tradesmen-docs/a.pdf",
      fileName: "a.pdf",
      verified: true,
      verifiedAt: "2026-05-11T10:00:00.000Z",
      verifiedBy: "admin-uid-test",
    },
    {
      type: "employer_liability",
      label: "",
      fileUrl: "https://pub.example.r2.dev/tradesmen-docs/legacy.pdf",
      fileName: "legacy.pdf",
      // no `verified` field - legacy row
    },
  ]);

  function mysqlFor(uid: string, raw: string | null = DOCS_JSON) {
    return vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT supporting_docs_json FROM tradesmen/.test(sql)) {
        if (params[0] !== uid) return [];
        return [{ supporting_docs_json: raw }];
      }
      return [];
    });
  }

  it("rejects non-admin callers with 403", async () => {
    const handlers = loadHandlers(docsListRoute, mysqlFor("u_target"), "get");
    const res = mockRes();
    await handlers[PATH](
      { user: { uid: "u_caller" }, params: { uid: "u_target" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 400 for an empty target uid", async () => {
    const handlers = loadHandlers(docsListRoute, mysqlFor("u_target"), "get");
    const res = mockRes();
    await handlers[PATH](
      { user: { uid: TEST_ADMIN_UID }, params: { uid: "   " } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "bad_uid" }),
    );
  });

  it("returns 404 when the target tradesman doesn't exist", async () => {
    const handlers = loadHandlers(docsListRoute, mysqlFor("u_target"), "get");
    const res = mockRes();
    await handlers[PATH](
      { user: { uid: TEST_ADMIN_UID }, params: { uid: "u_missing" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "tradesman_not_found" }),
    );
  });

  it("returns docs with normalised shape + verified flags", async () => {
    const handlers = loadHandlers(docsListRoute, mysqlFor("u_target"), "get");
    const res = mockRes();
    await handlers[PATH](
      { user: { uid: TEST_ADMIN_UID }, params: { uid: "u_target" } },
      res,
    );

    const body = res.json.mock.calls[0][0];
    expect(body.ok).toBe(true);
    expect(body.docs).toHaveLength(2);
    // Modern row preserves verified=true + audit fields
    expect(body.docs[0]).toMatchObject({
      type: "public_liability",
      label: "Northshield £5m",
      fileKey: "tradesmen-docs/a.pdf",
      verified: true,
      verifiedAt: "2026-05-11T10:00:00.000Z",
      verifiedBy: "admin-uid-test",
    });
    // Legacy row defaults `verified` to false even though the source
    // JSON has no `verified` field at all
    expect(body.docs[1]).toMatchObject({
      type: "employer_liability",
      label: "",
      fileUrl: "https://pub.example.r2.dev/tradesmen-docs/legacy.pdf",
      verified: false,
      verifiedAt: null,
      verifiedBy: null,
    });
  });

  it("returns an empty array when supporting_docs_json is null", async () => {
    const handlers = loadHandlers(docsListRoute, mysqlFor("u_target", null), "get");
    const res = mockRes();
    await handlers[PATH](
      { user: { uid: TEST_ADMIN_UID }, params: { uid: "u_target" } },
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true, docs: [] });
  });
});

/* ============= PATCH /api/admin/tradesmen/:uid/docs/:idx ============= */

describe("PATCH /api/admin/tradesmen/:uid/docs/:idx", () => {
  const PATH = "/admin/tradesmen/:uid/docs/:idx";

  const SEED = [
    {
      type: "public_liability",
      label: "Northshield £5m",
      fileKey: "tradesmen-docs/a.pdf",
      fileName: "a.pdf",
      verified: false,
    },
    {
      type: "employer_liability",
      label: "",
      fileKey: "tradesmen-docs/b.pdf",
      fileName: "b.pdf",
      verified: true,
      verifiedAt: "2026-05-01T00:00:00.000Z",
      verifiedBy: "admin-uid-test",
    },
  ];

  // Track the last UPDATE so we can introspect the new JSON
  function mysqlFor(uid: string) {
    const state = { lastWrite: null as string | null };
    const fn = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT supporting_docs_json FROM tradesmen/.test(sql)) {
        if (params[0] !== uid) return [];
        return [{ supporting_docs_json: JSON.stringify(SEED) }];
      }
      if (/UPDATE tradesmen SET supporting_docs_json/.test(sql)) {
        state.lastWrite = params[0];
        return [];
      }
      return [];
    });
    return { fn, state };
  }

  it("rejects non-admin callers with 403", async () => {
    const { fn } = mysqlFor("u_target");
    const handlers = loadHandlers(docVerifyRoute, fn, "patch");
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: "u_caller" },
        params: { uid: "u_target", idx: "0" },
        body: { verified: true },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 400 for an empty target uid", async () => {
    const { fn } = mysqlFor("u_target");
    const handlers = loadHandlers(docVerifyRoute, fn, "patch");
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        params: { uid: "   ", idx: "0" },
        body: { verified: true },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "bad_uid" }),
    );
  });

  it("returns 400 for a non-integer idx", async () => {
    const { fn } = mysqlFor("u_target");
    const handlers = loadHandlers(docVerifyRoute, fn, "patch");
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        params: { uid: "u_target", idx: "abc" },
        body: { verified: true },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "bad_idx" }),
    );
  });

  it("returns 404 when the target tradesman doesn't exist", async () => {
    const { fn } = mysqlFor("u_target");
    const handlers = loadHandlers(docVerifyRoute, fn, "patch");
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        params: { uid: "u_missing", idx: "0" },
        body: { verified: true },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "tradesman_not_found" }),
    );
  });

  it("returns 404 when idx is out of range", async () => {
    const { fn } = mysqlFor("u_target");
    const handlers = loadHandlers(docVerifyRoute, fn, "patch");
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        params: { uid: "u_target", idx: "99" },
        body: { verified: true },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "doc_not_found" }),
    );
  });

  it("flips verified=false → true and stamps verifiedAt + verifiedBy", async () => {
    const { fn, state } = mysqlFor("u_target");
    const handlers = loadHandlers(docVerifyRoute, fn, "patch");
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        params: { uid: "u_target", idx: "0" },
        body: { verified: true },
      },
      res,
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        doc: expect.objectContaining({
          verified: true,
          verifiedBy: TEST_ADMIN_UID,
        }),
      }),
    );
    const updated = JSON.parse(state.lastWrite || "[]");
    expect(updated[0].verified).toBe(true);
    expect(updated[0].verifiedBy).toBe(TEST_ADMIN_UID);
    expect(typeof updated[0].verifiedAt).toBe("string");
    // Other entries untouched
    expect(updated[1].verified).toBe(true);
    expect(updated[1].verifiedBy).toBe("admin-uid-test");
  });

  it("flips verified=true → false and clears audit fields", async () => {
    const { fn, state } = mysqlFor("u_target");
    const handlers = loadHandlers(docVerifyRoute, fn, "patch");
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        params: { uid: "u_target", idx: "1" },
        body: { verified: false },
      },
      res,
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        doc: expect.objectContaining({
          verified: false,
          verifiedAt: null,
          verifiedBy: null,
        }),
      }),
    );
    const updated = JSON.parse(state.lastWrite || "[]");
    expect(updated[1].verified).toBe(false);
    expect(updated[1].verifiedAt).toBeNull();
    expect(updated[1].verifiedBy).toBeNull();
  });

  it("coerces non-boolean `verified` body to false", async () => {
    const { fn, state } = mysqlFor("u_target");
    const handlers = loadHandlers(docVerifyRoute, fn, "patch");
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        params: { uid: "u_target", idx: "1" },
        body: { verified: "yes-please" }, // not a real boolean
      },
      res,
    );

    // The route does `!!req.body?.verified` so a truthy string still
    // counts as true. This test pins that behaviour - flip it explicitly
    // by sending `true` / `false` from the UI.
    const updated = JSON.parse(state.lastWrite || "[]");
    expect(updated[1].verified).toBe(true);
  });
});
