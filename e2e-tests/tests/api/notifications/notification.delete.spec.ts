import { test, expect } from "../../../src/fixtures";

test.describe("DELETE /api/notifications/:id", () => {
  test("returns 404 for non-existent notification", async ({ apiClient }) => {
    const res = await apiClient.delete("/api/notifications/999999");
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  test("returns 401 when not authenticated", async ({ request, runtime }) => {
    const res = await request.delete(
      `${runtime.apiBaseUrl}/api/notifications/1`,
    );
    expect(res.status()).toBe(401);
  });
});
