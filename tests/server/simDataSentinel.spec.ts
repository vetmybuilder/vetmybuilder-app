import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  checkProdForSimData,
} = require("../../server/lib/simDataSentinel");

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("simDataSentinel.checkProdForSimData", () => {
  let logger: any;

  beforeEach(() => {
    logger = { info: vi.fn(), warn: vi.fn() };
  });

  it("no-ops when NODE_ENV is not 'production'", async () => {
    process.env.NODE_ENV = "development";
    const mysqlQuery = vi.fn();
    await checkProdForSimData({ mysqlQuery, log: logger });
    expect(mysqlQuery).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs OK when production DB is clean", async () => {
    process.env.NODE_ENV = "production";
    const mysqlQuery = vi.fn().mockResolvedValue([
      { tbl: "tradesmen", hits: 0 },
      { tbl: "users", hits: 0 },
      { tbl: "projects", hits: 0 },
    ]);
    await checkProdForSimData({ mysqlQuery, log: logger });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][1]).toMatch(/no simulator data/i);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs a WARNING when production DB contains simulator rows", async () => {
    process.env.NODE_ENV = "production";
    const mysqlQuery = vi.fn().mockResolvedValue([
      { tbl: "tradesmen", hits: 6 },
      { tbl: "users", hits: 5 },
      { tbl: "projects", hits: 3 },
    ]);
    await checkProdForSimData({ mysqlQuery, log: logger });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [meta, msg] = logger.warn.mock.calls[0];
    expect(msg).toMatch(/simulator data found in production/i);
    expect(msg).toMatch(/tradesmen=6/);
    expect(msg).toMatch(/users=5/);
    expect(msg).toMatch(/projects=3/);
    expect(meta.offenders).toHaveLength(3);
  });

  it("does NOT warn for tables with zero hits (only flags real offenders)", async () => {
    process.env.NODE_ENV = "production";
    const mysqlQuery = vi.fn().mockResolvedValue([
      { tbl: "tradesmen", hits: 2 },
      { tbl: "users", hits: 0 },
      { tbl: "projects", hits: 0 },
    ]);
    await checkProdForSimData({ mysqlQuery, log: logger });
    const [meta, msg] = logger.warn.mock.calls[0];
    expect(msg).toMatch(/tradesmen=2/);
    expect(msg).not.toMatch(/users=/);
    expect(msg).not.toMatch(/projects=/);
    expect(meta.offenders).toHaveLength(1);
  });

  it("swallows errors from mysqlQuery and logs a warning instead of throwing", async () => {
    process.env.NODE_ENV = "production";
    const mysqlQuery = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      checkProdForSimData({ mysqlQuery, log: logger }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [meta, msg] = logger.warn.mock.calls[0];
    expect(msg).toMatch(/check failed/i);
    expect(meta.error).toBe("ECONNREFUSED");
  });

  it("no-ops when mysqlQuery is not a function", async () => {
    process.env.NODE_ENV = "production";
    await checkProdForSimData({ mysqlQuery: undefined, log: logger });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
