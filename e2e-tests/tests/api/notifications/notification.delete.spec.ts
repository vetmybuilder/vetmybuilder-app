import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

test.describe("DELETE /api/notifications/:id", () => {
  test("dismisses a notification and removes it from the list", async ({
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
    await tradesmanNotificationsApi.dismiss(notification!.id);
    await tradesmanNotificationsApi.expectNotificationGone(notification!.id);
  });

  test("returns 404 for non-existent notification", async ({ apiClient }) => {
    const res = await apiClient.del("/api/notifications/999999");
    expect(res.status()).toBe(404);
  });

  test("returns 401 when not authenticated", async ({ request, runtime }) => {
    const res = await request.delete(`${runtime.apiBaseUrl}/api/notifications/1`);
    expect(res.status()).toBe(401);
  });
});
