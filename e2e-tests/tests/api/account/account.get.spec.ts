import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/client";

test.describe("GET /api/account", () => {
  test("returns the current user", async ({ apiClient }) => {
    const res = await apiClient.get("/api/account");
    expect(res.status()).toBe(200);

    const { user } = await res.json();

    expect(user).toBeTruthy();
    expect(user.uid).toBeTruthy();
    expect(user.email).toBeTruthy();
  });
});
