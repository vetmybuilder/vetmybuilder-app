import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../server/lib/roles", () => ({
  requireAdmin: () => (_q: any, _r: any, n: any) => n(),
}));

function loadHandler(
  mount: any,
  ctx: any,
  verb: "post" | "get" | "put" = "post",
) {
  let captured: any = null;
  const router: any = {
    post: (...args: any[]) => {
      if (verb === "post") captured = args[args.length - 1];
    },
    get: (...args: any[]) => {
      if (verb === "get") captured = args[args.length - 1];
    },
    put: (...args: any[]) => {
      if (verb === "put") captured = args[args.length - 1];
    },
  };
  mount(router, ctx);
  if (!captured) throw new Error(`handler not captured for ${verb}`);
  return captured;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const mountGet = require("../../server/routes/admin/sales-script.get.js");
const mountPut = require("../../server/routes/admin/sales-script.put.js");
const mountGenerate = require("../../server/routes/admin/sales-script.generate.post.js");
const { DEFAULT_PRIMER } = require("../../server/lib/sales/defaultPrimer");
const {
  STUB_JSON,
} = require("../../server/lib/sales/generateSalesScript");

const VALID_SCRIPT_JSON = JSON.stringify({
  categories: [
    { name: "About", items: [{ q: "Who?", a: "We are." }] },
  ],
});

describe("GET /api/admin/sales-script", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seeds the default primer the first time it's called", async () => {
    const queries: any[] = [];
    let rowReadCount = 0;
    const mysqlQuery = vi.fn(async (sql: string, params?: any[]) => {
      queries.push([sql, params]);
      if (String(sql).startsWith("SELECT")) {
        rowReadCount += 1;
        if (rowReadCount === 1) return [];
        return [
          {
            id: 1,
            primer: DEFAULT_PRIMER,
            script_json: null,
            generated_at: null,
            updated_at: new Date(),
          },
        ];
      }
      if (String(sql).startsWith("INSERT")) {
        return { insertId: 1 };
      }
      return [];
    });

    const handler = loadHandler(
      mountGet,
      { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
      "get",
    );
    const res = mockRes();
    await handler({ user: { uid: "admin-1" } }, res);

    const insert = queries.find(([sql]) =>
      String(sql).includes("INSERT INTO sales_script"),
    );
    expect(insert, "seed insert was not made").toBeTruthy();
    expect(insert![1]).toContain(DEFAULT_PRIMER);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        primer: DEFAULT_PRIMER,
        script_json: null,
      }),
    );
  });

  it("returns the existing row on subsequent reads without re-seeding", async () => {
    const queries: any[] = [];
    const mysqlQuery = vi.fn(async (sql: string, params?: any[]) => {
      queries.push([sql, params]);
      if (String(sql).startsWith("SELECT")) {
        return [
          {
            id: 1,
            primer: "custom edited primer",
            script_json: VALID_SCRIPT_JSON,
            generated_at: new Date("2026-05-19T10:00:00Z"),
            updated_at: new Date(),
          },
        ];
      }
      return [];
    });
    const handler = loadHandler(
      mountGet,
      { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
      "get",
    );
    const res = mockRes();
    await handler({ user: { uid: "admin-1" } }, res);
    expect(
      queries.find(([sql]) => String(sql).includes("INSERT")),
    ).toBeFalsy();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        primer: "custom edited primer",
        script_json: VALID_SCRIPT_JSON,
      }),
    );
  });
});

describe("PUT /api/admin/sales-script", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeCtx() {
    const queries: any[] = [];
    return {
      queries,
      ctx: {
        auth: (_q: any, _r: any, n: any) => n(),
        mysqlQuery: vi.fn(async (sql: string, params?: any[]) => {
          queries.push([sql, params]);
          return { affectedRows: 1 };
        }),
      },
    };
  }

  it("rejects when both primer and script_json are missing", async () => {
    const { ctx } = makeCtx();
    const handler = loadHandler(mountPut, ctx, "put");
    const res = mockRes();
    await handler({ user: { uid: "admin-1" }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects script_json that doesn't parse", async () => {
    const { ctx } = makeCtx();
    const handler = loadHandler(mountPut, ctx, "put");
    const res = mockRes();
    await handler(
      {
        user: { uid: "admin-1" },
        body: { script_json: "not actually JSON" },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "script_json_not_parseable",
    });
  });

  it("rejects script_json that lacks a categories array", async () => {
    const { ctx } = makeCtx();
    const handler = loadHandler(mountPut, ctx, "put");
    const res = mockRes();
    await handler(
      {
        user: { uid: "admin-1" },
        body: { script_json: JSON.stringify({ wrong: "shape" }) },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "script_json_shape_invalid",
    });
  });

  it("updates only the primer when only primer is supplied", async () => {
    const { ctx, queries } = makeCtx();
    const handler = loadHandler(mountPut, ctx, "put");
    const res = mockRes();
    await handler(
      { user: { uid: "admin-1" }, body: { primer: "new primer text" } },
      res,
    );
    const update = queries.find(([sql]) =>
      String(sql).includes("UPDATE sales_script"),
    );
    expect(update).toBeTruthy();
    expect(String(update![0])).toMatch(/SET primer = \?/);
    expect(String(update![0])).not.toMatch(/script_json/);
    expect(update![1]).toContain("new primer text");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
    );
  });

  it("updates only script_json when only script_json is supplied (and shape is valid)", async () => {
    const { ctx, queries } = makeCtx();
    const handler = loadHandler(mountPut, ctx, "put");
    const res = mockRes();
    await handler(
      {
        user: { uid: "admin-1" },
        body: { script_json: VALID_SCRIPT_JSON },
      },
      res,
    );
    const update = queries.find(([sql]) =>
      String(sql).includes("UPDATE sales_script"),
    );
    expect(String(update![0])).toMatch(/SET script_json = \?/);
    expect(String(update![0])).not.toMatch(/SET primer/);
    expect(update![1]).toContain(VALID_SCRIPT_JSON);
  });

  it("updates both when both are supplied", async () => {
    const { ctx, queries } = makeCtx();
    const handler = loadHandler(mountPut, ctx, "put");
    const res = mockRes();
    await handler(
      {
        user: { uid: "admin-1" },
        body: { primer: "p", script_json: VALID_SCRIPT_JSON },
      },
      res,
    );
    const update = queries.find(([sql]) =>
      String(sql).includes("UPDATE sales_script"),
    );
    expect(String(update![0])).toMatch(/primer = \?/);
    expect(String(update![0])).toMatch(/script_json = \?/);
  });
});

describe("POST /api/admin/sales-script/generate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls the generator with the current primer, persists the result, returns it", async () => {
    process.env.MOCK_EXTERNAL_SERVICES = "1";
    const queries: any[] = [];
    const mysqlQuery = vi.fn(async (sql: string, params?: any[]) => {
      queries.push([sql, params]);
      if (String(sql).startsWith("SELECT")) {
        return [{ primer: "current primer text" }];
      }
      return { affectedRows: 1 };
    });
    const handler = loadHandler(
      mountGenerate,
      { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
      "post",
    );
    const res = mockRes();
    await handler({ user: { uid: "admin-1" }, body: {} }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        script_json: expect.stringContaining('"categories"'),
      }),
    );
    const update = queries.find(([sql]) =>
      String(sql).includes("UPDATE sales_script"),
    );
    expect(update, "generated script was not persisted").toBeTruthy();
    expect(String(update![0])).toMatch(/script_json = \?/);
    expect(String(update![0])).toMatch(/generated_at = NOW\(\)/);

    // The generator re-serialises the parsed JSON via JSON.stringify(parsed, null, 2),
    // so the stored value matches the stub object re-serialised the same way.
    const expected = JSON.stringify(JSON.parse(STUB_JSON), null, 2);
    expect(update![1][0]).toBe(expected);
  });

  it("returns 502 and does NOT overwrite the script when the generator throws", async () => {
    process.env.MOCK_EXTERNAL_SERVICES = "1";
    const queries: any[] = [];
    const mysqlQuery = vi.fn(async (sql: string, params?: any[]) => {
      queries.push([sql, params]);
      if (String(sql).startsWith("SELECT")) {
        return [{ primer: "primer" }];
      }
      return { affectedRows: 1 };
    });

    const ctx: any = {
      auth: (_q: any, _r: any, n: any) => n(),
      mysqlQuery,
      _generateSalesScript: vi.fn(async () => {
        throw new Error("anthropic timeout");
      }),
    };
    const handler = loadHandler(mountGenerate, ctx, "post");
    const res = mockRes();
    await handler({ user: { uid: "admin-1" }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(
      queries.some(([sql]) => String(sql).includes("UPDATE sales_script")),
    ).toBe(false);
  });

  it("returns 400 when the singleton row hasn't been seeded yet", async () => {
    const queries: any[] = [];
    const mysqlQuery = vi.fn(async (sql: string) => {
      queries.push([sql]);
      if (String(sql).startsWith("SELECT")) return [];
      return { affectedRows: 0 };
    });
    const handler = loadHandler(
      mountGenerate,
      { auth: (_q: any, _r: any, n: any) => n(), mysqlQuery },
      "post",
    );
    const res = mockRes();
    await handler({ user: { uid: "admin-1" }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "not_seeded" });
  });
});
