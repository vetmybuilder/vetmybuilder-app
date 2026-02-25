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

  test("POST /api/account rejects empty values (required fields)", async ({
    request,
    runtime,
  }) => {
    const baseUrl = runtime.apiBaseUrl;
    const uid = `user-required-${Date.now()}`;

    const client = await authedApiForUid(request, baseUrl, uid);

    // Ensure the user exists in the system first
    const signup = await client.post("/api/auth/signup", {
      firstName: "Test",
      lastName: "User",
      username: `req_${Date.now()}`,
      location: "London",
    });
    expect(signup.status()).toBe(200);

    const res = await client.post("/api/account", {
      firstName: null,
      lastName: null,
      username: null,
      location: "",
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({
      error: "missing_required_fields",
      message: "Please fill in all required fields.",
      fieldErrors: {
        firstName: "First name is required.",
        lastName: "Last name is required.",
        username: "Username is required.",
        location: "Postcode or city is required.",
      },
    });
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

    // Ensure both users exist
    const aSignup = await clientA.post("/api/auth/signup", {
      firstName: "Test",
      lastName: "User",
      username: `a_${Date.now()}`,
      location: "London",
    });
    expect(aSignup.status()).toBe(200);

    const bSignup = await clientB.post("/api/auth/signup", {
      firstName: "Test",
      lastName: "User",
      username: `b_${Date.now()}`,
      location: "London",
    });
    expect(bSignup.status()).toBe(200);

    // A sets the username to the "taken" one (requires full payload now)
    const aSet = await clientA.post("/api/account", {
      firstName: "Test",
      lastName: "User",
      username: takenUsername,
      location: "London",
    });
    expect(aSet.status()).toBe(200);
    expect(await aSet.json()).toEqual({ ok: true });

    await clientA.waitForAccount({ username: takenUsername });

    // B tries to use the same username
    const bSet = await clientB.post("/api/account", {
      firstName: "Test",
      lastName: "User",
      username: takenUsername,
      location: "London",
    });

    expect(bSet.status()).toBe(409);
    expect(await bSet.json()).toEqual({
      error: "username_taken",
      message: "That username is already taken.",
    });
  });
});
