import { test, expect } from "../../../src/fixtures";

test.describe("POST /api/subscriptions/checkout (mock provider)", () => {
  test("activates a subscription and shows subscribed=true on /me", async ({
    apiClient,
  }) => {
    const res = await apiClient.post("/api/subscriptions/checkout", {
      tier: "week_1",
      waiverAccepted: true,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, tier: "week_1" });
    expect(typeof body.sessionId).toBe("string");

    const meRes = await apiClient.get("/api/subscriptions/me");
    expect(meRes.status()).toBe(200);
    const me = await meRes.json();
    expect(me).toMatchObject({
      subscribed: true,
      tier: "week_1",
      status: "active",
    });
  });

  test("returns 400 for unknown tier", async ({ apiClient }) => {
    const res = await apiClient.post("/api/subscriptions/checkout", {
      tier: "year_1",
      waiverAccepted: true,
    });
    expect(res.status()).toBe(400);
  });

  test("cancel marks the subscription canceled", async ({ apiClient }) => {
    const checkoutRes = await apiClient.post("/api/subscriptions/checkout", {
      tier: "month_1",
      waiverAccepted: true,
    });
    expect(checkoutRes.status()).toBe(200);

    const cancelRes = await apiClient.post("/api/subscriptions/cancel", {});
    expect(cancelRes.status()).toBe(200);
    const cancelBody = await cancelRes.json();
    expect(cancelBody).toMatchObject({ ok: true, canceled: true });

    const meRes = await apiClient.get("/api/subscriptions/me");
    const me = await meRes.json();
    expect(me.subscribed).toBe(false);
    expect(me.status).toBe("canceled");
  });
});
