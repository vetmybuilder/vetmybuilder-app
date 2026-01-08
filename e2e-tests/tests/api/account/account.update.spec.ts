import { test, expect } from "../../../src/fixtures";
import Account from "../../../src/models/account";
import { authedApiForUid } from "../../../src/api/client";

test.describe("POST /api/account", () => {
  test("user can update their own account", async ({ apiClient }) => {
    const payload = Account.anAccount()
      .withRandomDetails()
      .withUsername("user_" + Date.now())
      .toPayload();

    const postRes = await apiClient.post("/api/account", payload);
    expect(postRes.status()).toBe(200);
    expect(await postRes.json()).toEqual({ ok: true });

    const getRes = await apiClient.get("/api/account");
    expect(getRes.status()).toBe(200);

    const { user } = await getRes.json();

    expect(user.firstName).toBe(payload.firstName);
    expect(user.lastName).toBe(payload.lastName);
    expect(user.username).toBe(payload.username);
  });

  test("cannot use a username that is already taken", async ({
    apiClient,
    request,
    runtime,
  }) => {
    const takenUsername = "taken_" + Date.now();

    // User A claims the username
    const aRes = await apiClient.post("/api/account", {
      username: takenUsername,
    });
    expect(aRes.status()).toBe(200);

    // User B: create a separate authed client
    const otherUid = "test-user-b-" + Date.now();
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid
    );

    // Ensure User B exists by creating/updating their account first
    const bUniqueUsername = "userb_" + Date.now();
    const bSetupRes = await otherClient.post("/api/account", {
      username: bUniqueUsername,
    });
    expect(bSetupRes.status()).toBe(200);

    // Now User B tries to claim User A's username
    const res = await otherClient.post("/api/account", {
      username: takenUsername,
    });

    expect(res.status()).toBe(409);
    expect(await res.json()).toEqual({
      error: "That username is already taken.",
    });
  });
});
