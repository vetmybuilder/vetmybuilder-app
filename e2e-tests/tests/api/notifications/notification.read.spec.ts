import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

test.describe("POST /api/notifications/:id/read", () => {
  test("marks a notification as read", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid, tradesmanNotificationsApi } =
      await setupTradesmanProfile({ request, apiBaseUrl: runtime.apiBaseUrl });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await hireApi.createHire(project.id, { tradesmanUserId: tradesmanUid });

    const notification = await tradesmanNotificationsApi.findLatestByType("hire_received");
    await tradesmanNotificationsApi.expectNotificationUnread(notification!.id);

    await tradesmanNotificationsApi.markAsRead(notification!.id);
    await tradesmanNotificationsApi.expectNotificationRead(notification!.id);
  });

  test("marking an already-read notification is idempotent", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid, tradesmanNotificationsApi } =
      await setupTradesmanProfile({ request, apiBaseUrl: runtime.apiBaseUrl });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await hireApi.createHire(project.id, { tradesmanUserId: tradesmanUid });

    const notification = await tradesmanNotificationsApi.findLatestByType("hire_received");
    await tradesmanNotificationsApi.markAsRead(notification!.id);
    await tradesmanNotificationsApi.markAsRead(notification!.id);
    await tradesmanNotificationsApi.expectNotificationRead(notification!.id);
  });

  test("returns 404 for non-existent notification", async ({ apiClient }) => {
    const res = await apiClient.post("/api/notifications/999999/read");
    expect(res.status()).toBe(404);
  });

  test("returns 400 for invalid ID", async ({ apiClient }) => {
    const res = await apiClient.post("/api/notifications/abc/read");
    expect(res.status()).toBe(400);
  });

  test("returns 401 when not authenticated", async ({ request, runtime }) => {
    const res = await request.post(`${runtime.apiBaseUrl}/api/notifications/1/read`);
    expect(res.status()).toBe(401);
  });
});
