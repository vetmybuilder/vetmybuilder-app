import { test, expect } from "../../../src/fixtures";

test.describe("Admin user management API", () => {
  test("POST creates a homeowner and GET returns them", async ({
    adminApiClient,
  }) => {
    const email = `test-ho-${Date.now()}@test.com`;
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
    const email = `test-tm-${Date.now()}@test.com`;
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
    const email = `test-up-${Date.now()}@test.com`;
    const createRes = await adminApiClient.post("/api/admin/users", {
      email,
      password: "Passw0rd!",
      firstName: "Before",
      lastName: "Update",
      role: "user",
    });
    const { user } = await createRes.json();

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
    const email = `test-del-${Date.now()}@test.com`;
    const createRes = await adminApiClient.post("/api/admin/users", {
      email,
      password: "Passw0rd!",
      firstName: "To",
      lastName: "Delete",
      role: "user",
    });
    const { user } = await createRes.json();

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
});
