import { test, expect } from "../../../src/fixtures";
import Account from "../../../src/models/account";
import { authedApiForUid } from "../../../src/api/client";

test.describe("POST /api/account", () => {
  test("user can update their own account", async ({ request, runtime }) => {
    const uid = "acct-update-" + Date.now();
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    const payload = {
      firstName: "Bernard",
      lastName: "Smith",
      username: "bernard_" + Date.now(),
    };

    await client.post("/api/account", payload);

    const user = await client.waitForAccount({
      firstName: payload.firstName,
      lastName: payload.lastName,
      username: payload.username,
    });

    expect(user.firstName).toBe(payload.firstName);
    expect(user.lastName).toBe(payload.lastName);
    expect(user.username).toBe(payload.username);
  });

  test("cannot use a username that is already taken", async ({
    request,
    runtime,
  }) => {
    const takenUsername =
      "taken_" + Math.random().toString(16).slice(2) + "_" + Date.now();

    // User A (fresh uid) claims the username
    const uidA =
      "user-a-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const clientA = await authedApiForUid(request, runtime.apiBaseUrl, uidA);

    await clientA.post("/api/account", { username: takenUsername });
    await clientA.waitForAccount({ username: takenUsername });

    // User B (fresh uid) tries to claim the same username
    const uidB =
      "user-b-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const clientB = await authedApiForUid(request, runtime.apiBaseUrl, uidB);

    const bUsername =
      "userb_" + Math.random().toString(16).slice(2) + "_" + Date.now();
    await clientB.post("/api/account", { username: bUsername });
    await clientB.waitForAccount({ username: bUsername });

    const res = await clientB.post("/api/account", { username: takenUsername });

    expect(res.status()).toBe(409);
    expect(await res.json()).toEqual({
      error: "That username is already taken.",
    });
  });
});
