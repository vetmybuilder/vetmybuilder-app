import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";
import Account from "../../../src/models/Account";

test.describe("POST /api/auth/signup", () => {
  test("creates/ensures user profile and /api/me returns initials", async ({
    request,
    runtime,
  }) => {
    const baseUrl = runtime.apiBaseUrl;

    const account = Account.anAccount().withRandomDetails();
    // ensure required fields for signup
    account.withFirstName(account.firstName || "Test");
    account.withLastName(account.lastName || "User");

    const uid = `signup-${Date.now()}`;
    const client = await authedApiForUid(request, baseUrl, uid);

    const payload = {
      firstName: account.firstName!,
      lastName: account.lastName!,
      username: account.username,
      location: account.location,
    };

    const res = await client.post("/api/auth/signup", payload);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // /api/me should now reflect the profile (and initials should not fall back to "U")
    const meRes = await client.get("/api/me");
    expect(meRes.status()).toBe(200);

    const me = await meRes.json();
    expect(me.uid).toBe(uid);
    expect(me.firstName).toBe(payload.firstName);
    expect(me.lastName).toBe(payload.lastName);

    // Initials should be correct (first+last rule)
    expect(me.initials).toBe(account.initials);
  });

  test("400 when firstName/lastName missing", async ({ request, runtime }) => {
    const baseUrl = runtime.apiBaseUrl;
    const uid = `signup-missing-${Date.now()}`;
    const client = await authedApiForUid(request, baseUrl, uid);

    const res = await client.post("/api/auth/signup", {
      firstName: "",
      lastName: "",
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({
      error: "missing_required_fields",
      message: "firstName and lastName are required",
    });
  });

  test("is safe to call twice (idempotent) and does not break /api/me", async ({
    request,
    runtime,
  }) => {
    const baseUrl = runtime.apiBaseUrl;

    const account = Account.anAccount().withRandomDetails();
    account.withFirstName(account.firstName || "Test");
    account.withLastName(account.lastName || "User");

    const uid = `signup-twice-${Date.now()}`;
    const client = await authedApiForUid(request, baseUrl, uid);

    const payload = {
      firstName: account.firstName!,
      lastName: account.lastName!,
      username: account.username,
      location: account.location,
    };

    const r1 = await client.post("/api/auth/signup", payload);
    expect(r1.status()).toBe(200);

    const r2 = await client.post("/api/auth/signup", payload);
    expect(r2.status()).toBe(200);

    const meRes = await client.get("/api/me");
    expect(meRes.status()).toBe(200);

    const me = await meRes.json();
    expect(me.firstName).toBe(payload.firstName);
    expect(me.lastName).toBe(payload.lastName);
    expect(me.initials).toBe(account.initials);
  });

  test("does not overwrite username/location when calling again without them", async ({
    request,
    runtime,
  }) => {
    const baseUrl = runtime.apiBaseUrl;
    const uid = `signup-partial-${Date.now()}`;
    const client = await authedApiForUid(request, baseUrl, uid);

    // First call sets username + location
    const a = Account.anAccount().withRandomDetails();
    a.withFirstName(a.firstName || "Test");
    a.withLastName(a.lastName || "User");

    const firstPayload = {
      firstName: a.firstName!,
      lastName: a.lastName!,
      username: a.username || `u_${Date.now()}`,
      location: a.location || "E4",
    };

    const r1 = await client.post("/api/auth/signup", firstPayload);
    expect(r1.status()).toBe(200);

    // Second call omits username/location (route uses COALESCE - should preserve)
    const r2 = await client.post("/api/auth/signup", {
      firstName: firstPayload.firstName,
      lastName: firstPayload.lastName,
      // username omitted
      // location omitted
    });
    expect(r2.status()).toBe(200);

    const meRes = await client.get("/api/me");
    expect(meRes.status()).toBe(200);

    const me = await meRes.json();
    expect(me.firstName).toBe(firstPayload.firstName);
    expect(me.lastName).toBe(firstPayload.lastName);
    // /api/me returns username if present, so it should still be there
    expect(me.username).toBe(firstPayload.username);
  });
});
