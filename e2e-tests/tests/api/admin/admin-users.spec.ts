import { test, expect } from "../../../src/fixtures";
import Tradesman from "../../../src/models/tradesman";

// Per-test email helper. The Firebase Auth emulator is shared across all
// shards, so `Date.now()` alone can collide when two shards run the same
// admin-users test at the same millisecond — the second create returns
// 409 "email_exists" and the destructure of `user` from a non-201
// response then explodes with "Cannot read properties of undefined".
// Mixing in random hex makes the email unique across shards even on a
// millisecond tie.
function uniqueEmail(prefix: string): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `${prefix}-${Date.now()}-${rand}@test.com`;
}

test.describe("Admin user management API", () => {
  test("POST creates a homeowner and GET returns them", async ({
    adminApiClient,
  }) => {
    const email = uniqueEmail("test-ho");
    const createRes = await adminApiClient.post("/api/admin/users", {
      email,
      password: "Passw0rd!",
      firstName: "Test",
      lastName: "Homeowner",
      location: "E4",
      role: "user",
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.ok).toBe(true);
    expect(created.user.uid).toBeTruthy();

    const listRes = await adminApiClient.get(`/api/admin/users?q=${encodeURIComponent(email)}`);
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.items.some((u: any) => u.email === email)).toBe(true);
  });

  test("POST creates a tradesman with company details", async ({
    adminApiClient,
  }) => {
    const email = uniqueEmail("test-tm");
    const createRes = await adminApiClient.post("/api/admin/users", {
      email,
      password: "Passw0rd!",
      firstName: "Trade",
      lastName: "Smith",
      location: "SW1",
      role: "tradesman",
      tradesman: {
        companyName: `Test Co ${Date.now()}`,
        tradeTypes: "Plumber,Bathroom Fitter",
        serviceAreas: "SW1,W1",
        status: "active",
      },
    });
    expect(createRes.status()).toBe(201);

    const listRes = await adminApiClient.get(`/api/admin/users?q=${encodeURIComponent(email)}`);
    const list = await listRes.json();
    const found = list.items.find((u: any) => u.email === email);
    expect(found).toBeTruthy();
    expect(found.role).toBe("tradesman");
    expect(found.tradesman?.companyName).toBeTruthy();
  });

  test("PUT updates user role and details", async ({
    adminApiClient,
  }) => {
    const email = uniqueEmail("test-up");
    const createRes = await adminApiClient.post("/api/admin/users", {
      email,
      password: "Passw0rd!",
      firstName: "Before",
      lastName: "Update",
      role: "user",
    });
    // Guard against the silent failure mode: if the create returned a
    // non-201 (e.g. 409 email_exists from a cross-shard collision in the
    // shared Firebase Auth emulator), the destructure below would yield
    // `user === undefined` and the next line would TypeError on `.uid`.
    // Asserting the status first turns that into a clear failure with
    // the body shape, not a cryptic property-read error.
    expect(createRes.status()).toBe(201);
    const { user } = await createRes.json();
    expect(user?.uid).toBeTruthy();

    const updateRes = await adminApiClient.put(`/api/admin/users/${user.uid}`, {
      firstName: "After",
      role: "admin",
    });
    expect(updateRes.status()).toBe(200);

    const listRes = await adminApiClient.get(`/api/admin/users?q=${encodeURIComponent(email)}`);
    const list = await listRes.json();
    const found = list.items.find((u: any) => u.uid === user.uid);
    expect(found.firstName).toBe("After");
    expect(found.role).toBe("admin");
  });

  test("DELETE removes a user", async ({
    adminApiClient,
  }) => {
    const email = uniqueEmail("test-del");
    const createRes = await adminApiClient.post("/api/admin/users", {
      email,
      password: "Passw0rd!",
      firstName: "To",
      lastName: "Delete",
      role: "user",
    });
    expect(createRes.status()).toBe(201);
    const { user } = await createRes.json();
    expect(user?.uid).toBeTruthy();

    const deleteRes = await adminApiClient.del(`/api/admin/users/${user.uid}`);
    expect(deleteRes.status()).toBe(200);

    const listRes = await adminApiClient.get(`/api/admin/users?q=${encodeURIComponent(email)}`);
    const list = await listRes.json();
    expect(list.items.some((u: any) => u.uid === user.uid)).toBe(false);
  });

  test("returns 400 when creating with missing fields", async ({
    adminApiClient,
  }) => {
    const res = await adminApiClient.post("/api/admin/users", {
      email: "incomplete@test.com",
    });
    expect(res.status()).toBe(400);
  });

  test("self-registered tradesperson appears in users list with role tradesman", async ({
    apiClient,
    adminApiClient,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    const listRes = await adminApiClient.get(
      `/api/admin/users?q=${encodeURIComponent(tradesman.companyName)}`,
    );
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    const found = list.items.find((u: any) => u.tradesman?.companyName === tradesman.companyName);
    expect(found).toBeTruthy();
    expect(found.role).toBe("tradesman");
  });

  test("role filter tradesman includes self-registered tradespeople", async ({
    apiClient,
    adminApiClient,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    const listRes = await adminApiClient.get("/api/admin/users?role=tradesman");
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    const found = list.items.find((u: any) => u.tradesman?.companyName === tradesman.companyName);
    expect(found).toBeTruthy();
  });

  test("role filter user excludes tradespeople", async ({
    apiClient,
    adminApiClient,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    const listRes = await adminApiClient.get("/api/admin/users?role=user");
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    const found = list.items.find((u: any) => u.tradesman?.companyName === tradesman.companyName);
    expect(found).toBeFalsy();
  });
});
