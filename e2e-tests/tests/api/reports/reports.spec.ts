import { test, expect } from "../../../src/fixtures";

test.describe("POST /api/reports", () => {
  test("creates a report for a profile", async ({ apiClient }) => {
    const res = await apiClient.post("/api/reports", {
      targetType: "profile",
      targetId: "test-builder-123",
      category: "spam",
      detail: "This profile looks fake",
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("creates a report for a recommendation", async ({ apiClient }) => {
    const res = await apiClient.post("/api/reports", {
      targetType: "recommendation",
      targetId: "456",
      category: "fake_review",
    });
    expect(res.status()).toBe(201);
  });

  test("creates a report for a photo", async ({ apiClient }) => {
    const res = await apiClient.post("/api/reports", {
      targetType: "photo",
      targetId: "789",
      category: "inappropriate_image",
      detail: "Contains inappropriate content",
    });
    expect(res.status()).toBe(201);
  });

  test("returns 409 ALREADY_REPORTED for duplicate open report", async ({
    apiClient,
  }) => {
    const payload = {
      targetType: "profile",
      targetId: `dup-target-${Date.now()}`,
      category: "abuse",
    };

    const first = await apiClient.post("/api/reports", payload);
    expect(first.status()).toBe(201);

    const second = await apiClient.post("/api/reports", payload);
    expect(second.status()).toBe(409);
    expect((await second.json()).error).toBe("ALREADY_REPORTED");
  });

  test("returns 400 for invalid target type", async ({ apiClient }) => {
    const res = await apiClient.post("/api/reports", {
      targetType: "invalid",
      targetId: "123",
      category: "spam",
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("Invalid target type");
  });

  test("returns 400 for missing target ID", async ({ apiClient }) => {
    const res = await apiClient.post("/api/reports", {
      targetType: "profile",
      category: "spam",
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("Target ID is required");
  });

  test("returns 400 for invalid category", async ({ apiClient }) => {
    const res = await apiClient.post("/api/reports", {
      targetType: "profile",
      targetId: "123",
      category: "not_a_category",
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("Invalid category");
  });

  test("returns 401 when not authenticated", async ({ request, runtime }) => {
    const res = await request.post(`${runtime.apiBaseUrl}/api/reports`, {
      data: { targetType: "profile", targetId: "123", category: "spam" },
    });
    expect(res.status()).toBe(401);
  });

  test("truncates detail to 1000 characters", async ({ apiClient }) => {
    const longDetail = "x".repeat(2000);
    const res = await apiClient.post("/api/reports", {
      targetType: "profile",
      targetId: `long-detail-${Date.now()}`,
      category: "other",
      detail: longDetail,
    });
    expect(res.status()).toBe(201);
  });
});

test.describe("GET /admin/reports", () => {
  test("returns open reports for admin", async ({
    apiClient,
    adminApiClient,
  }) => {
    const targetId = `admin-list-${Date.now()}`;
    await apiClient.post("/api/reports", {
      targetType: "profile",
      targetId,
      category: "spam",
      detail: "Test report for admin list",
    });

    const res = await adminApiClient.get("/api/admin/reports?status=open");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items).toBeTruthy();
    expect(body.total).toBeGreaterThanOrEqual(1);

    const found = body.items.find((r: any) => r.target_id === targetId);
    expect(found).toBeTruthy();
    expect(found.category).toBe("spam");
    expect(found.status).toBe("open");
  });

  test("returns 403 for non-admin", async ({ apiClient }) => {
    const res = await apiClient.get("/api/admin/reports");
    expect(res.status()).toBe(403);
  });
});

test.describe("PATCH /admin/reports/:id/resolve", () => {
  test("admin can mark a report as reviewed", async ({
    apiClient,
    adminApiClient,
  }) => {
    const targetId = `resolve-${Date.now()}`;
    await apiClient.post("/api/reports", {
      targetType: "recommendation",
      targetId,
      category: "fake_review",
    });

    const listRes = await adminApiClient.get("/api/admin/reports?status=open");
    const report = (await listRes.json()).items.find(
      (r: any) => r.target_id === targetId,
    );
    expect(report).toBeTruthy();

    const resolveRes = await adminApiClient.patch(
      `/api/admin/reports/${report.id}/resolve`,
      { action: "reviewed" },
    );
    expect(resolveRes.status()).toBe(200);

    const afterRes = await adminApiClient.get("/api/admin/reports?status=reviewed");
    const resolved = (await afterRes.json()).items.find(
      (r: any) => r.id === report.id,
    );
    expect(resolved).toBeTruthy();
    expect(resolved.status).toBe("reviewed");
  });

  test("admin can dismiss a report", async ({
    apiClient,
    adminApiClient,
  }) => {
    const targetId = `dismiss-${Date.now()}`;
    await apiClient.post("/api/reports", {
      targetType: "photo",
      targetId,
      category: "inappropriate_image",
    });

    const listRes = await adminApiClient.get("/api/admin/reports?status=open");
    const report = (await listRes.json()).items.find(
      (r: any) => r.target_id === targetId,
    );

    const res = await adminApiClient.patch(
      `/api/admin/reports/${report.id}/resolve`,
      { action: "dismissed" },
    );
    expect(res.status()).toBe(200);
  });

  test("returns 409 when report is already resolved", async ({
    apiClient,
    adminApiClient,
  }) => {
    const targetId = `double-resolve-${Date.now()}`;
    await apiClient.post("/api/reports", {
      targetType: "profile",
      targetId,
      category: "abuse",
    });

    const listRes = await adminApiClient.get("/api/admin/reports?status=open");
    const report = (await listRes.json()).items.find(
      (r: any) => r.target_id === targetId,
    );

    await adminApiClient.patch(`/api/admin/reports/${report.id}/resolve`, {
      action: "reviewed",
    });

    const res = await adminApiClient.patch(
      `/api/admin/reports/${report.id}/resolve`,
      { action: "dismissed" },
    );
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe("Report already resolved");
  });

  test("returns 400 for invalid action", async ({ adminApiClient }) => {
    const res = await adminApiClient.patch("/api/admin/reports/1/resolve", {
      action: "invalid",
    });
    expect(res.status()).toBe(400);
  });

  test("returns 404 for non-existent report", async ({ adminApiClient }) => {
    const res = await adminApiClient.patch("/api/admin/reports/999999/resolve", {
      action: "reviewed",
    });
    expect(res.status()).toBe(404);
  });
});
