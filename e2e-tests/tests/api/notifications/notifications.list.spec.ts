import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";
import Project from "../../../src/models/Project";
import NotificationsApi from "../../../src/apiHelper/NotificationsApi";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

test.describe("GET /api/notifications", () => {
  test("returns empty list and zero unread for new user", async ({
    request,
    runtime,
  }) => {
    const freshUid = `fresh-notif-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, freshUid);
    const freshNotificationsApi = new NotificationsApi(client);

    const { items, unread } = await freshNotificationsApi.list();
    expect(items).toHaveLength(0);
    expect(unread).toBe(0);
  });

  test("returns notifications after a hire creates one", async ({
    request,
    runtime,
    projectApi,
    hireApi,
    notificationsApi,
  }) => {
    const { uid: tradesmanUid, tradesmanNotificationsApi } =
      await setupTradesmanProfile({ request, apiBaseUrl: runtime.apiBaseUrl });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await hireApi.createHire(project.id, { tradesmanUserId: tradesmanUid });

    // Tradesman should have a notification
    const { items, unread } = await tradesmanNotificationsApi.list();
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(unread).toBeGreaterThanOrEqual(1);

    const hire = items.find((n) => n.type === "hire_received");
    expect(hire).toBeTruthy();
    expect(hire!.projectId).toBe(project.id);
  });

  test("unread count reflects only unread notifications", async ({
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

    // 1 unread
    await tradesmanNotificationsApi.expectUnreadCount(1);

    // Mark it as read
    const notification = await tradesmanNotificationsApi.findLatestByType("hire_received");
    await tradesmanNotificationsApi.markAsRead(notification!.id);

    // 0 unread
    await tradesmanNotificationsApi.expectUnreadCount(0);
  });

  test("returns 401 when not authenticated", async ({ request, runtime }) => {
    const res = await request.get(`${runtime.apiBaseUrl}/api/notifications`);
    expect(res.status()).toBe(401);
  });
});
