// Tests for the pilot-areas helper module - the single source of truth
// for which boroughs accept job postings. Every other layer (LocationField
// filter, projects POST gate, admin UI) reads through this module.
import { describe, it, expect, beforeEach, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pilotAreas = require("../../server/lib/pilotAreas");

const ALL_BOROUGH_NAMES: string[] = pilotAreas.LONDON_BOROUGHS;

/**
 * Build a fake mysqlQuery driven by an in-memory pilot_boroughs table.
 * Keeps the tests free of any real DB or sqlite stub.
 */
function makeFakeDb(initialRows: Array<{ name: string; enabled: 0 | 1 }> = []) {
  const rows = new Map<string, { name: string; enabled: 0 | 1 }>();
  for (const r of initialRows) rows.set(r.name, r);

  const query = vi.fn(async (sql: string, params: any[] = []) => {
    if (/SELECT COUNT\(\*\) AS c FROM pilot_boroughs/.test(sql)) {
      return [{ c: rows.size }];
    }
    if (/INSERT IGNORE INTO pilot_boroughs/.test(sql)) {
      const [name, enabled] = params;
      if (!rows.has(name)) rows.set(name, { name, enabled });
      return [];
    }
    if (/SELECT name, enabled FROM pilot_boroughs/.test(sql)) {
      return Array.from(rows.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    }
    if (/UPDATE pilot_boroughs SET enabled/.test(sql)) {
      const [enabled, name] = params;
      const existing = rows.get(name);
      if (existing) rows.set(name, { ...existing, enabled });
      return [];
    }
    return [];
  });

  return { query, rows };
}

describe("pilotAreas helper", () => {
  beforeEach(() => {
    pilotAreas.invalidateCache();
  });

  it("seeds the full borough catalog on first read with Waltham Forest enabled by default", async () => {
    const { query, rows } = makeFakeDb();

    const all = await pilotAreas.listBoroughs(query);

    expect(all.length).toBe(ALL_BOROUGH_NAMES.length);
    // Default enabled set: Waltham Forest only.
    const enabled = all.filter((b: any) => b.enabled).map((b: any) => b.name);
    expect(enabled).toEqual(["Waltham Forest"]);
    expect(rows.size).toBe(ALL_BOROUGH_NAMES.length);
  });

  it("does NOT re-seed on subsequent calls when rows already exist", async () => {
    // Pre-seed with everything disabled to prove we don't overwrite.
    const seeded = ALL_BOROUGH_NAMES.map((name) => ({
      name,
      enabled: 0 as 0,
    }));
    const { query } = makeFakeDb(seeded);

    const all = await pilotAreas.listBoroughs(query);

    expect(all.every((b: any) => !b.enabled)).toBe(true);
  });

  it("getEnabledBoroughs returns only enabled rows", async () => {
    const seeded = ALL_BOROUGH_NAMES.map((name) => ({
      name,
      enabled: (name === "Hackney" ? 1 : 0) as 0 | 1,
    }));
    const { query } = makeFakeDb(seeded);

    const enabled = await pilotAreas.getEnabledBoroughs(query);

    expect(enabled.map((b: any) => b.name)).toEqual(["Hackney"]);
  });

  it("getEnabledBoroughNameSet returns enabled borough names for O(1) membership tests", async () => {
    const seeded = ALL_BOROUGH_NAMES.map((name) => ({
      name,
      enabled: (name === "Waltham Forest" ? 1 : 0) as 0 | 1,
    }));
    const { query } = makeFakeDb(seeded);

    const set = await pilotAreas.getEnabledBoroughNameSet(query);

    expect(set.has("Waltham Forest")).toBe(true);
    expect(set.has("Hackney")).toBe(false);
  });

  it("setBoroughEnabled flips the flag and invalidates the cache", async () => {
    const seeded = ALL_BOROUGH_NAMES.map((name) => ({
      name,
      enabled: (name === "Waltham Forest" ? 1 : 0) as 0 | 1,
    }));
    const { query } = makeFakeDb(seeded);

    // Prime the cache with the initial state.
    let enabled = await pilotAreas.getEnabledBoroughs(query);
    expect(enabled.map((b: any) => b.name)).toEqual(["Waltham Forest"]);

    await pilotAreas.setBoroughEnabled(query, "Hackney", true);

    // The cache should be invalidated, so a fresh read returns Hackney too.
    enabled = await pilotAreas.getEnabledBoroughs(query);
    expect(enabled.map((b: any) => b.name).sort()).toEqual([
      "Hackney",
      "Waltham Forest",
    ]);
  });

  it("setBoroughEnabled rejects unknown borough names with code unknown_borough", async () => {
    const { query } = makeFakeDb();

    await expect(
      pilotAreas.setBoroughEnabled(query, "Atlantis", true),
    ).rejects.toMatchObject({ code: "unknown_borough" });
  });
});
