import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/client";
import Tradesman from "../../../src/models/tradesman";

test.describe("GET /api/tradesmen/me", () => {
  test("returns role=user and profile=null when the authenticated user is not a tradesman", async ({
    request,
    runtime,
  }) => {
    const uid = `user-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    const res = await client.get("/api/tradesmen/me");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ role: "user", profile: null });
  });

  test("tradesman happy path returns role=tradesman and profile", async ({
    apiClient,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();

    const putRes = await apiClient.put(
      "/api/tradesmen/me",
      tradesman.toPayload()
    );
    expect(putRes.status()).toBe(200);

    const putBody = await putRes.json();
    expect(putBody.ok).toBe(true);
    expect(putBody.profile).toBeTruthy();

    const res = await apiClient.get("/api/tradesmen/me");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.role).toBe("tradesman");
    expect(body.profile).toBeTruthy();
    expect(body.profile.company_name).toBeTruthy();
  });

  test("tradesman without photos returns empty photo_urls and photo_count=0", async ({
    apiClient,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();

    const putRes = await apiClient.put(
      "/api/tradesmen/me",
      tradesman.toPayload()
    );
    expect(putRes.status()).toBe(200);

    const putBody = await putRes.json();
    expect(putBody.ok).toBe(true);

    const res = await apiClient.get("/api/tradesmen/me");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.role).toBe("tradesman");

    const profile = body.profile;
    expect(profile).toBeTruthy();

    expect(Array.isArray(profile.photo_urls)).toBe(true);
    expect(profile.photo_urls).toEqual([]);

    expect(profile.photo_count).toBe(0);
  });

  test("401 unauthenticated", async ({ request, runtime }) => {
    const res = await request.get(`${runtime.apiBaseUrl}/api/tradesmen/me`);
    expect(res.status()).toBe(401);
  });
});
