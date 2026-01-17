import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("POST /api/account", () => {
  test("user can update their own account", async ({ apiClient }) => {
    const payload = {
      firstName: "Bernard",
      lastName: "Smith",
      username: `bernard_${Date.now()}`,
    };

    const res = await apiClient.post("/api/account", payload);
    expect(res.status()).toBe(200);

    const user = await apiClient.waitForAccount(payload);

    expect(user.firstName).toBe(payload.firstName);
    expect(user.lastName).toBe(payload.lastName);
    expect(user.username).toBe(payload.username);
  });

  test("cannot use a username that is already taken", async ({
    request,
    runtime,
  }) => {
    const baseUrl = runtime.apiBaseUrl;
    const takenUsername = `taken_${Date.now()}`;

    // User A claims the username
    const clientA = await authedApiForUid(
      request,
      baseUrl,
      `user-a-${Date.now()}`,
    );

    expect(
      (
        await clientA.post("/api/account", { username: takenUsername })
      ).status(),
    ).toBe(200);

    await clientA.waitForAccount({ username: takenUsername });

    // User B tries to claim the same username
    const clientB = await authedApiForUid(
      request,
      baseUrl,
      `user-b-${Date.now()}`,
    );

    const res = await clientB.post("/api/account", {
      username: takenUsername,
    });

    expect(res.status()).toBe(409);
    expect(await res.json()).toEqual({
      error: "That username is already taken.",
    });
  });
});
