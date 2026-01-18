import { test, expect } from "../../../src/fixtures";

test.describe("GET /api/account", () => {
  test("returns the current user", async ({ apiClient }) => {
    const res = await apiClient.get("/api/account");
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    const user = body?.user;

    expect(user).toBeTruthy();
    expect(user.uid).toBeTruthy();
    expect(user.email).toBeTruthy();
  });
});
