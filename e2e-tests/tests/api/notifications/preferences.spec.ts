import { test, expect } from "../../../src/fixtures";

test.describe("GET /api/notifications/preferences", () => {
  test("returns defaults for a new user", async ({ apiClient }) => {
    const res = await apiClient.get("/api/notifications/preferences");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.preferences).toEqual({
      hire_updates: true,
      recommendations: true,
      builder_interest: true,
      local_activity: false,
      project_matches: true,
    });
  });

  test("returns 401 when not authenticated", async ({ request, runtime }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/notifications/preferences`,
    );
    expect(res.status()).toBe(401);
  });
});

test.describe("PUT /api/notifications/preferences", () => {
  test("updates a preference", async ({ apiClient }) => {
    const putRes = await apiClient.put("/api/notifications/preferences", {
      data: { hire_updates: false },
    });
    expect(putRes.status()).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.ok).toBe(true);

    const getRes = await apiClient.get("/api/notifications/preferences");
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.preferences.hire_updates).toBe(false);
    expect(getBody.preferences.recommendations).toBe(true);
    expect(getBody.preferences.builder_interest).toBe(true);
    expect(getBody.preferences.local_activity).toBe(false);
    expect(getBody.preferences.project_matches).toBe(true);
  });

  test("rejects invalid category", async ({ apiClient }) => {
    const res = await apiClient.put("/api/notifications/preferences", {
      data: { invalid_category: true },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_categories");
  });
});
