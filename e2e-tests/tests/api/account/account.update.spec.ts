import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("Account APIs", () => {
  test("POST /api/auth/signup creates/ensures a profile", async ({
    request,
    runtime,
  }) => {
    const baseUrl = runtime.apiBaseUrl;
    const uid = `user-${Date.now()}`;

    const client = await authedApiForUid(request, baseUrl, uid);

    const res = await client.post("/api/auth/signup", {
      firstName: "Test",
      lastName: "User",
      username: `test_${Date.now()}`,
      location: "London",
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("POST /api/account enforces username uniqueness", async ({
    request,
    runtime,
  }) => {
    const baseUrl = runtime.apiBaseUrl;
    const takenUsername = `taken_${Date.now()}`;

    const clientA = await authedApiForUid(
      request,
      baseUrl,
      `user-a-${Date.now()}`,
    );
    const clientB = await authedApiForUid(
      request,
      baseUrl,
      `user-b-${Date.now()}`,
    );

    const aSignup = await clientA.post("/api/auth/signup", {
      firstName: "Test",
      lastName: "User",
      location: "London",
    });
    expect(aSignup.status()).toBe(200);

    const bSignup = await clientB.post("/api/auth/signup", {
      firstName: "Test",
      lastName: "User",
      location: "London",
    });
    expect(bSignup.status()).toBe(200);

    const aSet = await clientA.post("/api/account", {
      username: takenUsername,
    });
    expect(aSet.status()).toBe(200);

    await clientA.waitForAccount({ username: takenUsername });

    const bSet = await clientB.post("/api/account", {
      username: takenUsername,
    });

    expect(bSet.status()).toBe(409);
    expect(await bSet.json()).toEqual({
      error: "That username is already taken.",
    });
  });
});
