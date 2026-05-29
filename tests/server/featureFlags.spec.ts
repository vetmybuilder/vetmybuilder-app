// tests/server/featureFlags.spec.ts
//
// Unit tests for the feature-flag helper: code defaults, DB overrides,
// the in-memory cache, and isFlagEnabled / clearFlagCache.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  FLAG_DEFINITIONS,
  loadFlags,
  isFlagEnabled,
  clearFlagCache,
} = require("../../server/lib/featureFlags.js");

beforeEach(() => {
  clearFlagCache();
});

describe("featureFlags helper", () => {
  it("ships payments and homeowner_signup defaulting to off", () => {
    const keys = FLAG_DEFINITIONS.map((d: any) => d.key);
    expect(keys).toContain("payments");
    expect(keys).toContain("homeowner_signup");
    for (const def of FLAG_DEFINITIONS) {
      expect(def.default).toBe(false);
    }
  });

  it("returns code defaults when the table has no rows", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const flags = await loadFlags(mysqlQuery);
    expect(flags.payments).toBe(false);
    expect(flags.homeowner_signup).toBe(false);
  });

  it("applies DB overrides over the defaults", async () => {
    const mysqlQuery = vi
      .fn()
      .mockResolvedValue([{ flag_key: "payments", enabled: 1 }]);
    const flags = await loadFlags(mysqlQuery);
    expect(flags.payments).toBe(true);
    expect(flags.homeowner_signup).toBe(false);
  });

  it("ignores unknown flag keys in the table", async () => {
    const mysqlQuery = vi
      .fn()
      .mockResolvedValue([{ flag_key: "not_a_real_flag", enabled: 1 }]);
    const flags = await loadFlags(mysqlQuery);
    expect(flags).not.toHaveProperty("not_a_real_flag");
    expect(flags.payments).toBe(false);
  });

  it("fails safe to defaults when the query throws", async () => {
    const mysqlQuery = vi.fn().mockRejectedValue(new Error("table missing"));
    const flags = await loadFlags(mysqlQuery);
    expect(flags.payments).toBe(false);
    expect(flags.homeowner_signup).toBe(false);
  });

  it("caches reads so a second call does not hit the DB", async () => {
    const mysqlQuery = vi
      .fn()
      .mockResolvedValue([{ flag_key: "payments", enabled: 1 }]);
    await loadFlags(mysqlQuery);
    await loadFlags(mysqlQuery);
    expect(mysqlQuery).toHaveBeenCalledTimes(1);
  });

  it("clearFlagCache forces a fresh DB read", async () => {
    const mysqlQuery = vi
      .fn()
      .mockResolvedValue([{ flag_key: "payments", enabled: 1 }]);
    await loadFlags(mysqlQuery);
    clearFlagCache();
    await loadFlags(mysqlQuery);
    expect(mysqlQuery).toHaveBeenCalledTimes(2);
  });

  it("isFlagEnabled reflects the DB override", async () => {
    const mysqlQuery = vi
      .fn()
      .mockResolvedValue([{ flag_key: "homeowner_signup", enabled: 1 }]);
    expect(await isFlagEnabled(mysqlQuery, "homeowner_signup")).toBe(true);
    expect(await isFlagEnabled(mysqlQuery, "payments")).toBe(false);
  });

  it("isFlagEnabled is false for an undefined flag", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    expect(await isFlagEnabled(mysqlQuery, "nope")).toBe(false);
  });
});

describe("featureFlags env overrides (e2e only)", () => {
  const saved = {
    TEST_ENV: process.env.TEST_ENV,
    FEATURE_PAYMENTS: process.env.FEATURE_PAYMENTS,
    FEATURE_HOMEOWNER_SIGNUP: process.env.FEATURE_HOMEOWNER_SIGNUP,
  };

  beforeEach(() => clearFlagCache());

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearFlagCache();
  });

  it("FEATURE_* env vars win over the DB when TEST_ENV=e2e", async () => {
    process.env.TEST_ENV = "e2e";
    process.env.FEATURE_PAYMENTS = "1";
    process.env.FEATURE_HOMEOWNER_SIGNUP = "1";
    // DB explicitly says payments off - the env override must still win.
    const mysqlQuery = vi
      .fn()
      .mockResolvedValue([{ flag_key: "payments", enabled: 0 }]);
    const flags = await loadFlags(mysqlQuery);
    expect(flags.payments).toBe(true);
    expect(flags.homeowner_signup).toBe(true);
  });

  it("ignores FEATURE_* env vars when not in the e2e context", async () => {
    delete process.env.TEST_ENV;
    process.env.FEATURE_PAYMENTS = "1";
    process.env.FEATURE_HOMEOWNER_SIGNUP = "1";
    const mysqlQuery = vi.fn().mockResolvedValue([]);
    const flags = await loadFlags(mysqlQuery);
    expect(flags.payments).toBe(false);
    expect(flags.homeowner_signup).toBe(false);
  });

  it("honors an explicit off override (FEATURE_PAYMENTS=0) in e2e", async () => {
    process.env.TEST_ENV = "e2e";
    process.env.FEATURE_PAYMENTS = "0";
    const mysqlQuery = vi
      .fn()
      .mockResolvedValue([{ flag_key: "payments", enabled: 1 }]);
    const flags = await loadFlags(mysqlQuery);
    expect(flags.payments).toBe(false);
  });
});
