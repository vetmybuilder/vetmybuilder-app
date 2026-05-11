import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the location helper so we don't need a real DB. The route still
// passes the (mocked) mysqlQuery and uid through to it; we just verify
// it gets called rather than testing its internals here.
vi.mock("../../server/lib/location.js", () => ({
  updateUserLocationMysql: vi.fn().mockResolvedValue(undefined),
}));

// Mock the logger to keep test output quiet.
vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Import after mocks are set up so the route module picks up the mocks.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const accountPost = require("../../server/routes/account/account.post.js");

type Handler = (req: any, res: any) => Promise<void>;

/**
 * Build a stub Express router that captures the POST /account handler so we
 * can call it directly without spinning up Express.
 */
function loadRouteHandler(mysqlQuery: any): Handler {
  let captured: Handler | null = null;
  const fakeRouter = {
    post: (_path: string, _auth: unknown, handler: Handler) => {
      captured = handler;
    },
  };
  // The auth middleware is a no-op for these tests — we set req.user
  // ourselves to simulate a verified Firebase token.
  const ctx = { auth: (_req: unknown, _res: unknown, next: any) => next(), mysqlQuery };
  accountPost(fakeRouter, ctx);
  if (!captured) throw new Error("route handler was not captured");
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("POST /api/account — derivation from Firebase claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives firstName/lastName from the Google `name` claim when not provided", async () => {
    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      // Username uniqueness lookup → no row taken
      if (/SELECT 1\s+FROM users\s+WHERE username/.test(sql)) return [];
      // INSERT/UPDATE upsert → capture the params
      if (/INSERT INTO users/.test(sql)) {
        inserted.push(params);
        return [];
      }
      return [];
    });

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: {
          uid: "uid-jane",
          name: "Jane Smith",
          email: "jane.smith@example.com",
        },
        body: { location: "E4" },
      },
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(inserted).toHaveLength(1);
    const [uid, email, firstName, lastName, username, locationRaw] = inserted[0];
    expect(uid).toBe("uid-jane");
    expect(email).toBe("jane.smith@example.com");
    expect(firstName).toBe("Jane");
    expect(lastName).toBe("Smith");
    expect(username).toBe("jane.smith");
    expect(locationRaw).toBe("E4");
  });

  it("handles a single-name display name (lastName ends up empty)", async () => {
    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT 1/.test(sql)) return [];
      if (/INSERT INTO users/.test(sql)) {
        inserted.push(params);
        return [];
      }
      return [];
    });

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-cher", name: "Cher", email: "cher@example.com" },
        body: { location: "SW1A" },
      },
      res,
    );

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    const [, , firstName, lastName] = inserted[0];
    expect(firstName).toBe("Cher");
    expect(lastName).toBe("");
  });

  it("falls back to email localpart for firstName when no `name` claim", async () => {
    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT 1/.test(sql)) return [];
      if (/INSERT INTO users/.test(sql)) {
        inserted.push(params);
        return [];
      }
      return [];
    });

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-noname", email: "anon@example.com" },
        body: { location: "N1" },
      },
      res,
    );

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    const [, , firstName, lastName, username] = inserted[0];
    expect(firstName).toBe("anon");
    expect(lastName).toBe("");
    expect(username).toBe("anon");
  });

  it("auto-resolves a username collision by appending a numeric suffix", async () => {
    let lookupCalls = 0;
    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT 1/.test(sql)) {
        lookupCalls += 1;
        const candidate = params[0];
        // First two candidates are "taken", third is free.
        if (candidate === "taken" || candidate === "taken1") return [{ "1": 1 }];
        return [];
      }
      if (/INSERT INTO users/.test(sql)) {
        inserted.push(params);
        return [];
      }
      return [];
    });

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-dup", name: "Taken Name", email: "taken@example.com" },
        body: { location: "E4" },
      },
      res,
    );

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(lookupCalls).toBe(3); // taken, taken1, taken2
    const [, , , , username] = inserted[0];
    expect(username).toBe("taken2");
  });

  it("accepts a missing location (no longer required at signup) and stores locationRaw=null", async () => {
    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT 1/.test(sql)) return [];
      if (/INSERT INTO users/.test(sql)) {
        inserted.push(params);
        return [];
      }
      return [];
    });

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-x", name: "Some Body", email: "x@example.com" },
        body: {},
      },
      res,
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    const [, , , , , locationRaw] = inserted[0];
    // Empty/missing location → null in the column, COALESCE preserves any
    // previously-stored value on update.
    expect(locationRaw).toBeNull();
  });

  it("preserves the 409 username_taken contract when caller supplies a clashing username", async () => {
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (/SELECT 1/.test(sql)) return [{ "1": 1 }];
      return [];
    });

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: { uid: "uid-y", email: "y@example.com" },
        body: {
          firstName: "Y",
          lastName: "Y",
          username: "alreadytaken",
          location: "E4",
        },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: "username_taken",
      message: "That username is already taken.",
    });
  });

  it("respects caller-supplied firstName/lastName/username when present (email-signup path)", async () => {
    const inserted: any[] = [];
    const mysqlQuery = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
      if (/SELECT 1/.test(sql)) return [];
      if (/INSERT INTO users/.test(sql)) {
        inserted.push(params);
        return [];
      }
      return [];
    });

    const handler = loadRouteHandler(mysqlQuery);
    const res = mockRes();

    await handler(
      {
        user: {
          uid: "uid-email",
          // Important: claims have a different name than the body. The body
          // wins because the email-signup form collects them explicitly.
          name: "Claim Name",
          email: "claim@example.com",
        },
        body: {
          firstName: "Body",
          lastName: "Name",
          username: "bodyname",
          location: "E4",
        },
      },
      res,
    );

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    const [, , firstName, lastName, username] = inserted[0];
    expect(firstName).toBe("Body");
    expect(lastName).toBe("Name");
    expect(username).toBe("bodyname");
  });
});
