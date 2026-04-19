import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

const { claimPipelineEntry } = require("../../server/lib/claimPipelineEntry.js");

describe("claimPipelineEntry", () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQuery = vi.fn();
  });

  it("claims by company number", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/WHERE company_number/.test(sql)) {
        return [{ id: 7, company_name: "Acme Plumbing Ltd" }];
      }
      return [];
    });

    await claimPipelineEntry({
      mysqlQuery: mockQuery,
      uid: "uid-123",
      companyName: "Acme Plumbing Ltd",
      companyNumber: "12345678",
    });

    const updateCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => /UPDATE tradesperson_pipeline SET claimed_by/.test(sql),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toEqual(["uid-123", 7]);
  });

  it("claims by normalised name when no company number", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/WHERE company_number/.test(sql)) {
        return [];
      }
      if (/WHERE claimed_by IS NULL AND status/.test(sql)) {
        return [{ id: 9, company_name: "Acme Plumbing Ltd" }];
      }
      return [];
    });

    await claimPipelineEntry({
      mysqlQuery: mockQuery,
      uid: "uid-456",
      companyName: "Acme Plumbing",
      companyNumber: null,
    });

    const updateCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => /UPDATE tradesperson_pipeline SET claimed_by/.test(sql),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toEqual(["uid-456", 9]);
  });

  it("links existing pipeline recommendations for matching company", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/WHERE company_number/.test(sql)) {
        return [{ id: 3, company_name: "Bob Builder Ltd" }];
      }
      if (/WHERE claimed_by IS NULL AND status/.test(sql)) {
        return [];
      }
      if (/UPDATE tradesperson_pipeline SET claimed_by/.test(sql)) {
        return [];
      }
      if (/SELECT id, company FROM recommendations/.test(sql)) {
        return [
          { id: 101, company: "Bob Builder Ltd" },
          { id: 102, company: "Other Company Ltd" },
        ];
      }
      return [];
    });

    await claimPipelineEntry({
      mysqlQuery: mockQuery,
      uid: "uid-789",
      companyName: "Bob Builder Ltd",
      companyNumber: "99999999",
    });

    const recUpdateCalls = mockQuery.mock.calls.filter(
      ([sql]: [string]) => /UPDATE recommendations SET linked_tradesman_uid/.test(sql),
    );
    expect(recUpdateCalls).toHaveLength(1);
    expect(recUpdateCalls[0][1]).toEqual(["uid-789", 101]);
  });

  it("does nothing when company name is empty", async () => {
    await claimPipelineEntry({
      mysqlQuery: mockQuery,
      uid: "uid-000",
      companyName: "",
      companyNumber: null,
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("does nothing when no match exists", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/WHERE company_number/.test(sql)) return [];
      if (/WHERE claimed_by IS NULL AND status/.test(sql)) return [];
      return [];
    });

    await claimPipelineEntry({
      mysqlQuery: mockQuery,
      uid: "uid-111",
      companyName: "Unknown Company",
      companyNumber: "00000000",
    });

    const updateCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => /UPDATE tradesperson_pipeline SET claimed_by/.test(sql),
    );
    expect(updateCall).toBeUndefined();
  });

  it("never throws on DB error", async () => {
    mockQuery.mockRejectedValue(new Error("DB connection lost"));

    await expect(
      claimPipelineEntry({
        mysqlQuery: mockQuery,
        uid: "uid-222",
        companyName: "Any Company",
        companyNumber: null,
      }),
    ).resolves.toBeUndefined();
  });
});
