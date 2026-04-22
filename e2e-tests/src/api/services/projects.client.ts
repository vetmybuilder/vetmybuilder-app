import { expect } from "@playwright/test";
import type { ApiCore } from "../_core";

export function projectsClient(core: ApiCore) {
  async function getProjectRecommendation(projectId: number, recId: number) {
    const res = await core.get(`/api/projects/${projectId}/recommendations`);
    expect(res.ok()).toBe(true);

    const body = await res.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const item = items.find((r: any) => r && r.id === recId);

    return item || null;
  }

  async function findProjectRecommendationByCompany(
    projectId: number,
    companyName: string,
  ) {
    const res = await core.get(`/api/projects/${projectId}/recommendations`);
    expect(res.ok()).toBe(true);

    const body = await res.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const item = items.find((r: any) => r && r.company === companyName);

    return item || null;
  }

  async function uploadProjectClosePhotos(
    projectId: number,
    photoPaths: string[],
  ) {
    const payload = { fields: {}, photos: photoPaths };
    return core.postMultipart(
      `/api/projects/${projectId}/close/photos`,
      payload,
    );
  }

  async function uploadProjectClosePhotosUnauthed(
    projectId: number,
    photoPaths: string[],
  ) {
    const multipart: Record<string, any> = {};

    if (photoPaths.length > 0) {
      // core.postMultipart handles relative paths; but this unauthed call is node-level multipart
      // Keep behaviour identical to your old implementation by using core.request directly:
      // (this is still a "projects client" concern, not spec concern)
      // NOTE: for now we keep it simple: send just first photo if given.
      const p = photoPaths[0]!;
      multipart.photos = {
        name: "photo.jpg",
        mimeType: "image/jpeg",
        buffer: require("fs").readFileSync(
          require("path").isAbsolute(p)
            ? p
            : require("path").resolve(__dirname, "../../..", p),
        ),
      };
    }

    return core.request.post(
      `${core.baseUrl}/api/projects/${projectId}/close/photos`,
      {
        multipart,
      },
    );
  }

  async function waitForNotification(message: string) {
    await expect
      .poll(async () => {
        const res = await core.get(`/api/notifications`);
        if (!res.ok()) return false;

        const body = await res.json();
        const items = Array.isArray(body?.items) ? body.items : [];
        return items.some((n: any) => n.message === message);
      })
      .toBe(true);
  }

  async function createProjectMagicLink(projectId: number) {
    return core.post(`/api/projects/${projectId}/magic-link`, {});
  }

  async function rotateProjectMagicLink(projectId: number) {
    return core.post(`/api/projects/${projectId}/magic-link?rotate=1`, {});
  }

  async function unlockProjectWithMockPayment(projectId: number) {
    const checkoutRes = await core.post(`/api/projects/${projectId}/unlock-contact/checkout`);
    expect(checkoutRes.ok(), `unlock checkout failed: ${await checkoutRes.text()}`).toBe(true);
    const checkoutBody = await checkoutRes.json();
    if (checkoutBody.alreadyUnlocked) return;
    expect(checkoutBody.sessionId).toBeTruthy();
    const payRes = await core.post(`/api/payments/mock/pay`, {
      sessionId: checkoutBody.sessionId,
      card: { number: "4242 4242 4242 4242", expMonth: 12, expYear: 2030, cvc: "123" },
    });
    expect(payRes.ok(), `mock pay failed: ${await payRes.text()}`).toBe(true);
  }

  return {
    getProjectRecommendation,
    findProjectRecommendationByCompany,
    uploadProjectClosePhotos,
    uploadProjectClosePhotosUnauthed,
    waitForNotification,
    createProjectMagicLink,
    rotateProjectMagicLink,
    unlockProjectWithMockPayment,
  };
}
