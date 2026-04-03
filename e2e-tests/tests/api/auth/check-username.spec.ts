import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("GET /api/auth/check-username", () => {
  test("returns available: true for a username that does not exist", async ({
    request,
    runtime,
  }) => {
    const username = `available_${Date.now()}`;
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/auth/check-username?username=${encodeURIComponent(username)}`,
    );
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, available: true });
  });

  test("returns available: false for a username that is already taken", async ({
    request,
    runtime,
  }) => {
    const username = `taken_${Date.now()}`;
    const uid = `check-un-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    const r = await client.post("/api/account", {
      firstName: "Test",
      lastName: "User",
      username,
      location: "E4",
    });
    expect(r.status()).toBe(200);

    const res = await request.get(
      `${runtime.apiBaseUrl}/api/auth/check-username?username=${encodeURIComponent(username)}`,
    );
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, available: false });
  });

  test("400 when username query param is missing", async ({
    request,
    runtime,
  }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/auth/check-username`,
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "username required" });
  });
});
