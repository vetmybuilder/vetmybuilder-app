import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/lib/logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

const { surfacePipelineTradespeople } = require("../../server/lib/surfacePipelineTradespeople.js");

// Unregistered pipeline candidate
const UNREGISTERED_CANDIDATE = {
  id: 1,
  company_name: "Acme Plumbing Ltd",
  email: "hello@acme.co.uk",
  phone: "07700900000",
  website: "https://acme.co.uk",
  google_rating: 4.8,
  google_reviews_count: 120,
  company_number: "12345678",
  claimed_by: null,
  vetting_score: 75,
  tradesman_vmb_score: null,
  tradesman_public_id: null,
  effective_score: 75,
};

// Registered pipeline candidate (claimed_by is set)
const REGISTERED_CANDIDATE = {
  id: 2,
  company_name: "Elegant Building Services",
  email: "info@elegant.co.uk",
  phone: "07700900123",
  website: "https://elegant.co.uk",
  google_rating: 4.8,
  google_reviews_count: 167,
  company_number: "12345678",
  claimed_by: "tradesman-uid-1",
  vetting_score: 53,
  tradesman_vmb_score: 77,
  tradesman_public_id: "pub-123",
  effective_score: 77,
};

function mockQuery(overrides: Record<string, any[]> = {}) {
  const calls: { sql: string; params: any[] }[] = [];
  const fn = vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
    calls.push({ sql, params: params || [] });
    if (/project_classifications/.test(sql)) return overrides.classifications || [{ structured: JSON.stringify({ recommended_trades: ["Plumber"] }) }];
    if (/FROM tradesperson_pipeline/.test(sql)) return overrides.candidates || [];
    if (/FROM recommendations WHERE projectId/.test(sql)) return overrides.existingRecs || [];
    if (/ownerUserId/.test(sql)) return [{ ownerUserId: "owner-1" }];
    if (/INSERT INTO recommendations/.test(sql)) return [];
    if (/INSERT INTO notifications/.test(sql)) return [];
    if (/UPDATE recommendations/.test(sql)) return [];
    return [];
  });
  return { fn, calls };
}

const BASE = {
  projectId: 42,
  projectType: "Plumber",
  projectLocation: "E4 0AW",
  broadcastNotification: vi.fn(),
  logActivity: vi.fn(),
};

describe("surfacePipelineTradespeople", () => {

  // ── Unregistered tradesman ────────────────────────────────────

  describe("unregistered tradesman (not on VMB)", () => {
    it("inserts as source='pipeline' so it appears in vetted businesses card", async () => {
      const { fn, calls } = mockQuery({ candidates: [UNREGISTERED_CANDIDATE] });

      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn });

      const insert = calls.find((c) => c.sql.includes("INSERT INTO recommendations"));
      expect(insert).toBeTruthy();
      expect(insert!.params).toContain("pipeline");
      expect(insert!.params).toContain("Acme Plumbing Ltd");
      // linked_tradesman_uid should be null
      expect(insert!.params[insert!.params.length - 1]).toBeNull();
    });

    it("notification says vetted local business", async () => {
      const { fn, calls } = mockQuery({ candidates: [UNREGISTERED_CANDIDATE] });

      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn });

      const notif = calls.find((c) => c.sql.includes("INSERT INTO notifications"));
      expect(notif).toBeTruthy();
      expect(notif!.params[1]).toContain("vetted local business");
    });
  });

  // ── Registered tradesman, NOT yet recommended ─────────────────

  describe("registered tradesman, not yet recommended on this project", () => {
    it("inserts as source='community_match' so it appears in top recommendations", async () => {
      const { fn, calls } = mockQuery({ candidates: [REGISTERED_CANDIDATE] });

      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn });

      const insert = calls.find((c) => c.sql.includes("INSERT INTO recommendations"));
      expect(insert).toBeTruthy();
      expect(insert!.params).toContain("community_match");
      expect(insert!.params).toContain("tradesman-uid-1");
    });

    it("notification says matched to your job", async () => {
      const { fn, calls } = mockQuery({ candidates: [REGISTERED_CANDIDATE] });

      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn });

      const notif = calls.find((c) => c.sql.includes("INSERT INTO notifications"));
      expect(notif).toBeTruthy();
      expect(notif!.params[1]).toContain("matched to your job");
      expect(notif!.params[1]).not.toContain("vetted local business");
    });
  });

  // ── Registered tradesman, ALREADY recommended ─────────────────

  describe("registered tradesman, already recommended on this project", () => {
    it("does not insert a duplicate recommendation", async () => {
      const { fn, calls } = mockQuery({
        candidates: [REGISTERED_CANDIDATE],
        existingRecs: [{ company: "Elegant Building Services", source: "platform", linked_tradesman_uid: null }],
      });

      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn });

      const insert = calls.find((c) => c.sql.includes("INSERT INTO recommendations"));
      expect(insert).toBeUndefined();
    });

    it("links the existing recommendation to the tradesman if not already linked", async () => {
      const { fn, calls } = mockQuery({
        candidates: [REGISTERED_CANDIDATE],
        existingRecs: [{ company: "Elegant Building Services", source: "platform", linked_tradesman_uid: null }],
      });

      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn });

      const update = calls.find((c) => c.sql.includes("UPDATE recommendations"));
      expect(update).toBeTruthy();
      expect(update!.params).toContain("tradesman-uid-1");
    });

    it("does nothing if recommendation is already linked", async () => {
      const { fn, calls } = mockQuery({
        candidates: [REGISTERED_CANDIDATE],
        existingRecs: [{ company: "Elegant Building Services", source: "platform", linked_tradesman_uid: "tradesman-uid-1" }],
      });

      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn });

      const insert = calls.find((c) => c.sql.includes("INSERT INTO recommendations"));
      expect(insert).toBeUndefined();
      const update = calls.find((c) => c.sql.includes("UPDATE recommendations"));
      expect(update).toBeUndefined();
    });
  });

  // ── Dedup ─────────────────────────────────────────────────────

  describe("dedup", () => {
    it("skips unregistered company that already has a recommendation", async () => {
      const { fn, calls } = mockQuery({
        candidates: [UNREGISTERED_CANDIDATE],
        existingRecs: [{ company: "Acme Plumbing Ltd", source: "platform", linked_tradesman_uid: null }],
      });

      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn });

      const insert = calls.find((c) => c.sql.includes("INSERT INTO recommendations"));
      expect(insert).toBeUndefined();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────

  describe("edge cases", () => {
    it("does nothing when no location provided", async () => {
      const { fn } = mockQuery();
      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn, projectLocation: "" });
      expect(fn).not.toHaveBeenCalled();
    });

    it("does nothing when no projectType provided", async () => {
      const { fn } = mockQuery();
      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn, projectType: "" });
      expect(fn).not.toHaveBeenCalled();
    });

    it("does nothing when no candidates match", async () => {
      const { fn, calls } = mockQuery({ candidates: [] });
      await surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn });
      const insert = calls.find((c) => c.sql.includes("INSERT INTO recommendations"));
      expect(insert).toBeUndefined();
    });

    it("never throws on DB error", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("DB down"));
      await expect(
        surfacePipelineTradespeople({ ...BASE, mysqlQuery: fn }),
      ).resolves.toBeUndefined();
    });
  });
});
