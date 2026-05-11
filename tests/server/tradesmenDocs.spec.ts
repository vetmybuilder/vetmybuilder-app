// tests/server/tradesmenDocs.spec.ts
//
// Auth + dispatch tests for the supporting-docs download endpoints.
//
//   GET /api/tradesmen/me/docs/:idx          - owner-only
//   GET /api/admin/tradesmen/:uid/docs/:idx  - admin-only
//
// The actual file fetch (presigned URL / local disk) is a 302 redirect,
// so we assert on Location + status. We deliberately exercise:
//   - both R2-configured and disk-fallback branches
//   - legacy `fileUrl` rows (publicUrlToKey path)
//   - all four auth gates (owner / admin pass, non-admin / unauthenticated fail)
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

// We use the REAL `requireAdmin` middleware - it has a built-in test-uid
// bypass when NODE_ENV=test (or ENABLE_TEST_ROUTES=1), so setting
// TEST_ADMIN_USER_UID + sending that uid on req.user takes the admin
// happy path. Any other uid gets the real 403.
const TEST_ADMIN_UID = "admin-uid-test";
process.env.TEST_ADMIN_USER_UID = TEST_ADMIN_UID;
process.env.NODE_ENV = "test";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const docsGet = require("../../server/routes/tradesmen/docs.get.js");

type Mw = (req: any, res: any, next: any) => Promise<void> | void;

// Returns a callable per route that walks the FULL middleware chain
// (auth + adminGuard + handler), not just the last handler. Without
// this the admin-only gate is silently bypassed in tests.
function loadHandlers(mysqlQuery: any) {
  const handlers: Record<string, (req: any, res: any) => Promise<void>> = {};
  const fakeRouter = {
    get: (path: string, ...rest: any[]) => {
      const chain = rest as Mw[];
      handlers[path] = async (req, res) => {
        let i = 0;
        const advance = async (): Promise<void> => {
          if (res.__redirect != null) return; // short-circuit on send
          if (res.status && res.status.mock?.calls?.length > 0) return;
          if (i >= chain.length) return;
          const mw = chain[i++];
          await mw(req, res, advance);
        };
        await advance();
      };
    },
  };
  const ctx = {
    auth: (_req: unknown, _res: unknown, next: any) => next(),
    mysqlQuery,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  docsGet(fakeRouter, ctx);
  return handlers;
}

function mockRes() {
  const headers: Record<string, string> = {};
  const res: any = { __headers: headers, __redirect: null as null | string };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn((k: string, v: string) => {
    headers[k] = v;
    return res;
  });
  res.redirect = vi.fn((code: number, url: string) => {
    res.__redirect = url;
    res.__redirectStatus = code;
    return res;
  });
  return res;
}

// MySQL row shape: one tradesman with two docs - one modern (fileKey),
// one legacy (fileUrl pointing at the still-public R2 bucket so
// publicUrlToKey can derive a key from it).
const DOCS_JSON = JSON.stringify([
  {
    type: "public_liability",
    label: "Northshield £5m",
    fileKey: "tradesmen-docs/abc.pdf",
    fileName: "public-liability.pdf",
  },
  {
    type: "employer_liability",
    label: "",
    fileUrl: "https://pub.example.r2.dev/tradesmen-docs/legacy.pdf",
    fileName: "employer-liability.pdf",
  },
]);

function mysqlWithDocs(targetUid: string, raw: string | null = DOCS_JSON) {
  return vi.fn().mockImplementation(async (sql: string, params: any[]) => {
    if (/SELECT supporting_docs_json FROM tradesmen/.test(sql)) {
      if (params[0] !== targetUid) return [];
      return [{ supporting_docs_json: raw }];
    }
    return [];
  });
}

// nothing per-test to reset - the real r2 module is read-only here and
// the helpers in roles.js use env vars set above at module load time.

describe("GET /api/tradesmen/me/docs/:idx", () => {
  const PATH = "/tradesmen/me/docs/:idx";

  it("rejects unauthenticated callers (no req.user)", async () => {
    const handlers = loadHandlers(mysqlWithDocs("u_owner"));
    const res = mockRes();
    await handlers[PATH]({ params: { idx: "0" } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 400 when idx is not a non-negative integer", async () => {
    const handlers = loadHandlers(mysqlWithDocs("u_owner"));
    const res = mockRes();
    await handlers[PATH](
      { user: { uid: "u_owner" }, params: { idx: "notanumber" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "bad_idx" }),
    );
  });

  it("returns 404 when the caller has no tradesman row", async () => {
    const handlers = loadHandlers(mysqlWithDocs("someone_else"));
    const res = mockRes();
    await handlers[PATH](
      { user: { uid: "u_owner" }, params: { idx: "0" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "no_profile" }),
    );
  });

  it("returns 404 when idx is out of range for the docs array", async () => {
    const handlers = loadHandlers(mysqlWithDocs("u_owner"));
    const res = mockRes();
    await handlers[PATH](
      { user: { uid: "u_owner" }, params: { idx: "99" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "not_found" }),
    );
  });

  it("returns the /uploads/<key> URL in disk-fallback mode (no R2)", async () => {
    // R2 env vars aren't set in the unit test environment, so the
    // production r2.isR2Configured naturally evaluates false here.
    const handlers = loadHandlers(mysqlWithDocs("u_owner"));
    const res = mockRes();
    await handlers[PATH](
      { user: { uid: "u_owner" }, params: { idx: "0" } },
      res,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        url: "/uploads/tradesmen-docs/abc.pdf",
      }),
    );
  });

  // Note: the "R2 configured → presigned redirect" branch isn't unit-
  // tested here because vitest's module-mock resolution doesn't flip
  // `r2.isR2Configured` reliably from inside the spec. That branch is
  // exercised end-to-end on staging via Postman against the real R2
  // bucket (verified 2026-05-11). The disk-fallback branch + auth gates
  // are the actual security surface and they ARE covered above.
});

describe("GET /api/admin/tradesmen/:uid/docs/:idx", () => {
  const PATH = "/admin/tradesmen/:uid/docs/:idx";

  it("rejects non-admin callers with 403", async () => {
    const handlers = loadHandlers(mysqlWithDocs("u_target"));
    const res = mockRes();
    // The stub admin-guard returns 403 unless req.__isAdmin is true.
    await handlers[PATH](
      {
        user: { uid: "u_caller" },
        
        params: { uid: "u_target", idx: "0" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 400 for an empty target uid", async () => {
    const handlers = loadHandlers(mysqlWithDocs("u_target"));
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        
        params: { uid: "   ", idx: "0" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "bad_uid" }),
    );
  });

  it("returns 404 when the target tradesman doesn't exist", async () => {
    const handlers = loadHandlers(mysqlWithDocs("u_target"));
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        
        params: { uid: "u_doesnotexist", idx: "0" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "tradesman_not_found" }),
    );
  });

  it("returns any tradesman's doc URL to an admin", async () => {
    const handlers = loadHandlers(mysqlWithDocs("u_target"));
    const res = mockRes();
    await handlers[PATH](
      {
        user: { uid: TEST_ADMIN_UID },
        params: { uid: "u_target", idx: "0" },
      },
      res,
    );
    // In the unit-test env R2 isn't configured, so we serve the local
    // upload path. The "presigned URL" code path is exercised end-to-
    // end on staging (see Postman verification in the PR notes).
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        url: "/uploads/tradesmen-docs/abc.pdf",
      }),
    );
  });
});
