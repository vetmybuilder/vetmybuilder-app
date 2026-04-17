import { test, expect } from "../../../src/fixtures";

const fakeSub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fake-token-123",
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfines",
    auth: "tBHItJI5svbpC7htL8nqYA",
  },
};

test.describe("POST /api/push/subscribe", () => {
  test("stores a push subscription", async ({ apiClient }) => {
    const res = await apiClient.post("/api/push/subscribe", fakeSub);
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("returns 400 when subscription data is missing", async ({
    apiClient,
  }) => {
    const res = await apiClient.post("/api/push/subscribe", {});
    expect(res.status()).toBe(400);
  });

  test("returns 400 when keys are missing", async ({ apiClient }) => {
    const res = await apiClient.post("/api/push/subscribe", {
      endpoint: fakeSub.endpoint,
    });
    expect(res.status()).toBe(400);
  });

  test("returns 401 when not authenticated", async ({ request, runtime }) => {
    const res = await request.post(`${runtime.apiBaseUrl}/api/push/subscribe`, {
      data: fakeSub,
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("POST /api/push/unsubscribe", () => {
  test("removes a push subscription", async ({ apiClient }) => {
    // Subscribe first
    const subRes = await apiClient.post("/api/push/subscribe", fakeSub);
    expect(subRes.status()).toBe(201);

    // Now unsubscribe
    const res = await apiClient.post("/api/push/unsubscribe", {
      endpoint: fakeSub.endpoint,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("returns 401 when not authenticated", async ({ request, runtime }) => {
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/push/unsubscribe`,
      { data: { endpoint: fakeSub.endpoint } },
    );
    expect(res.status()).toBe(401);
  });
});
