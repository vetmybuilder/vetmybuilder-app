import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";

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

  test("POST /api/account requires location (other fields are derived from token claims)", async ({
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

    // Only `location` is required from the client now — first/last/username
    // are derived server-side from the Firebase token claims (Google `name`,
    // email) when not supplied. So omitting them but providing a blank
    // location should fail with a single fieldError on `location`.
    const res = await client.post("/api/account", {
      firstName: null,
      lastName: null,
      username: null,
      location: "",
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({
      error: "missing_required_fields",
      message: "Please enter your postcode or city.",
      fieldErrors: {
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

  test("POST /api/account derives firstName/lastName/username from token claims when not supplied", async ({
    request,
    runtime,
  }) => {
    const baseUrl = runtime.apiBaseUrl;
    const uid = `user-derive-${Date.now()}`;

    const client = await authedApiForUid(request, baseUrl, uid);

    // Send ONLY location — the server should derive the rest from the
    // Firebase token claims (uid alone, in this E2E test). With no `name`
    // claim it falls back to the email-localpart-as-firstName path.
    const res = await client.post("/api/account", { location: "E4" });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Verify the user row got populated. firstName/lastName/username should
    // all be non-null even though we didn't supply them.
    const me = await client.get("/api/me");
    expect(me.status()).toBe(200);
    const meBody = await me.json();
    expect(meBody.firstName).toBeTruthy();
    expect(meBody.username).toBeTruthy();
    expect(meBody.locationRaw).toBe("E4");
    expect(meBody.postcodeOutward).toBe("E4");
  });

  // NOTE: the auto-username collision-suffix path is exercised in
  // tests/server/account.post.spec.ts. We can't test it via E2E because the
  // username derivation reads the `email` claim from the Firebase token, and
  // the test-mint endpoint (`/api/__test__/auth/id-token`) only sets `uid`.
  // Sending an explicit clashing username in the body just hits the legacy
  // 409 path, which is already covered by the "enforces username uniqueness"
  // test above.

  test("email availability check rejects an existing email", async ({
    request,
    runtime,
  }) => {
    const baseUrl = runtime.apiBaseUrl;
    const email = `existing+${Date.now()}@test.com`;
    const password = "Passw0rd!";

    await createAuthUser(email, password);

    const res = await request.post(`${baseUrl}/api/auth/check-email`, {
      data: { email },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      exists: true,
    });
  });
});
