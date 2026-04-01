import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";
import Project from "../../../src/models/Project";
import Tradesman from "../../../src/models/tradesman";
import SharesApi from "../../../src/apiHelper/tradesman/SharesApi";

test.describe("GET /api/tradesmen/shares", () => {
  test("returns empty shares when no tradesman has shared for the project", async ({
    apiClient,
    projectApi,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const sharesApi = new SharesApi(apiClient);
    const shares = await sharesApi.getShares(created.id);

    expect(shares).toEqual([]);
  });

  test("returns share with primaryPhotoUrl from tradesman profile_picture_url", async ({
    request,
    apiClient,
    projectApi,
    runtime,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const tradesmanUid = `tradesman-shares-photo-${Date.now()}`;
    const tradesmanClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      tradesmanUid,
    );

    const profilePictureUrl = "https://cdn.example.com/profile.jpg";
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls([profilePictureUrl])
      .withProfilePictureUrl(profilePictureUrl);

    const putRes = await tradesmanClient.put(
      "/api/tradesmen/me",
      tradesman.toPayload(),
    );
    expect(putRes.status()).toBe(200);

    const tradesmanSharesApi = new SharesApi(tradesmanClient);
    await tradesmanSharesApi.shareProfile(created.id);

    const homeownerSharesApi = new SharesApi(apiClient);
    const shares = await homeownerSharesApi.getShares(created.id);

    expect(shares).toHaveLength(1);
    expect(shares[0].primaryPhotoUrl).toBe(profilePictureUrl);
    expect(shares[0].companyName).toBe(tradesman.companyName);
    expect(shares[0].tradesmanUid).toBe(tradesmanUid);
  });

  test("returns primaryPhotoUrl as null when tradesman has no profile picture", async ({
    request,
    apiClient,
    projectApi,
    runtime,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const tradesmanUid = `tradesman-shares-no-pic-${Date.now()}`;
    const tradesmanClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      tradesmanUid,
    );

    const tradesman = Tradesman.aTradesman().withRandomDetails();
    const putRes = await tradesmanClient.put(
      "/api/tradesmen/me",
      tradesman.toPayload(),
    );
    expect(putRes.status()).toBe(200);

    const tradesmanSharesApi = new SharesApi(tradesmanClient);
    await tradesmanSharesApi.shareProfile(created.id);

    const homeownerSharesApi = new SharesApi(apiClient);
    const shares = await homeownerSharesApi.getShares(created.id);

    expect(shares).toHaveLength(1);
    expect(shares[0].primaryPhotoUrl).toBeNull();
  });

  test("returns 401 without auth", async ({ request, runtime }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/tradesmen/shares?projectId=1`,
    );
    expect(res.status()).toBe(401);
  });
});

test.describe("POST /api/tradesmen/shares", () => {
  test("returns 403 when user is not a registered tradesman", async ({
    request,
    apiClient,
    projectApi,
    runtime,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const nonTradesmanUid = `not-a-tradesman-${Date.now()}`;
    const nonTradesmanClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      nonTradesmanUid,
    );

    const res = await nonTradesmanClient.post("/api/tradesmen/shares", {
      projectId: created.id,
    });
    expect(res.status()).toBe(403);
  });

  test("returns 401 without auth", async ({ request, runtime }) => {
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/shares`,
      { data: { projectId: 1 } },
    );
    expect(res.status()).toBe(401);
  });
});
