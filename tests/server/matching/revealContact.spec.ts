import { describe, it, expect, vi } from "vitest";
const { getMatchContact } = require("../../../server/lib/matching/revealContact.js");

describe("getMatchContact", () => {
  it("returns null when no matched row exists", async () => {
    const q = vi.fn().mockResolvedValueOnce([]);
    const result = await getMatchContact(q, {
      projectId: 1,
      viewerUid: "u1",
      otherUid: "b1",
    });
    expect(result).toBeNull();
  });

  it("returns the builder's contact when viewer is the homeowner", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([
        { status: "matched", homeowner_uid: "hoUid", builder_uid: "bUid" },
      ])
      .mockResolvedValueOnce([
        { phone: "07123456789", email: "b@example.com", company_name: "BCo" },
      ]);
    const result = await getMatchContact(q, {
      projectId: 1,
      viewerUid: "hoUid",
      otherUid: "bUid",
    });
    expect(result).toMatchObject({
      phone: "07123456789",
      email: "b@example.com",
      displayName: "BCo",
    });
  });

  it("returns the homeowner's contact when viewer is the builder (phone null, users has no phone)", async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce([
        { status: "matched", homeowner_uid: "hoUid", builder_uid: "bUid" },
      ])
      .mockResolvedValueOnce([
        { email: "h@example.com", firstName: "Chris" },
      ]);
    const result = await getMatchContact(q, {
      projectId: 1,
      viewerUid: "bUid",
      otherUid: "hoUid",
    });
    expect(result).toMatchObject({
      phone: null,
      email: "h@example.com",
      displayName: "Chris",
    });
  });

  it("returns null if status is not matched", async () => {
    const q = vi.fn().mockResolvedValueOnce([
      { status: "pending", homeowner_uid: "hoUid", builder_uid: "bUid" },
    ]);
    const result = await getMatchContact(q, {
      projectId: 1,
      viewerUid: "u1",
      otherUid: "b1",
    });
    expect(result).toBeNull();
  });
});
