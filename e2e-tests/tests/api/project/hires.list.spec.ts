import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import { authedApiForUid } from "../../../src/api/services/client";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";
import HireApi from "../../../src/apiHelper/project/HireApi";
import { uniq } from "../../../src/utils/formatters";

test.describe("GET /api/projects/:projectId/hires", () => {
  async function liveProjectForOwner(apiClient: any): Promise<number> {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);
    const { project } = await projectRes.json();

    const publishRes = await apiClient.post(`/api/projects/${project.id}/publish`);
    expect(publishRes.status()).toBe(200);

    return project.id;
  }

  test("returns an empty list when the project has no hires", async ({
    apiClient,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const body = await hireApi.listHires(projectId);

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("returns a single hire for an onboarded tradesman with display info", async ({
    apiClient,
    request,
    runtime,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const { uid: tradesmanUid, tradesman } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await hireApi.createHire(projectId, {
      tradesmanUserId: tradesmanUid,
      homeownerMessage: "Looking forward to it",
    });

    const body = await hireApi.listHires(projectId);

    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);

    const item = body.items[0];
    expect(item.projectId).toBe(projectId);
    expect(item.tradesmanUserId).toBe(tradesmanUid);
    expect(item.recommendationId).toBeNull();
    expect(item.status).toBe("pending");
    expect(item.homeownerMessage).toBe("Looking forward to it");
    expect(item.tradesmanMessage).toBeNull();
    expect(item.cancelReason).toBeNull();
    expect(item.respondedAt).toBeNull();
    expect(item.cancelledAt).toBeNull();
    expect(item.hiredAt).toBeTruthy();
    expect(item.expiresAt).toBeTruthy();

    // Display info
    expect(item.displayName).toBe(tradesman.companyName);
    expect(item.tradesmanCompanyName).toBe(tradesman.companyName);
    expect(item.invitedCompanyName).toBeNull();
    expect(item.inviteChannel).toBeNull();
  });

  test("returns a hire for a recommendation with displayName from invited snapshot", async ({
    apiClient,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);
    const uniqueCompany = `Invite Path Co ${uniq("hires-list")} Ltd`;

    const recRes = await apiClient.post(
      `/api/projects/${projectId}/recommendations`,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withCompany(uniqueCompany)
        .withCompanyEmail("hello@example.test")
        .toPayload(),
    );
    expect(recRes.status()).toBe(201);
    const { recommendationId, resolvedCompany } = await recRes.json();

    await hireApi.createHire(projectId, { recommendationId });

    const body = await hireApi.listHires(projectId);

    expect(body.total).toBe(1);
    const item = body.items[0];
    // tradesmanUserId may be null or populated — the background company
    // verification job can resolve the recommendation to a known tradesman
    // before this assertion runs. In CI under load this race is common.
    expect(item.recommendationId).toBe(recommendationId);
    expect(item.status).toBe("pending_invite");
    expect(item.inviteChannel).toBe("email");
    expect(item.invitedCompanyName).toBe(resolvedCompany);
    expect(item.displayName).toBe(resolvedCompany);
  });

  test("returns multiple hires sorted newest first", async ({
    apiClient,
    request,
    runtime,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const { uid: firstTradesman } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });
    const { uid: secondTradesman } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });
    const { uid: thirdTradesman } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await hireApi.createHire(projectId, { tradesmanUserId: firstTradesman });
    await hireApi.createHire(projectId, { tradesmanUserId: secondTradesman });
    await hireApi.createHire(projectId, { tradesmanUserId: thirdTradesman });

    const body = await hireApi.listHires(projectId);

    expect(body.total).toBe(3);
    expect(body.items.map((i: any) => i.tradesmanUserId)).toEqual([
      thirdTradesman,
      secondTradesman,
      firstTradesman,
    ]);
  });

  test("never leaks the inviteToken in the response", async ({
    apiClient,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const recRes = await apiClient.post(
      `/api/projects/${projectId}/recommendations`,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withCompanyEmail("private@example.test")
        .toPayload(),
    );
    const { recommendationId } = await recRes.json();

    await hireApi.createHire(projectId, { recommendationId });

    const body = await hireApi.listHires(projectId);
    expect(body.items).toHaveLength(1);

    const item = body.items[0];
    expect(item).not.toHaveProperty("inviteToken");
    expect(item).not.toHaveProperty("invitedContactEmail");
  });

  test("returns 404 when the project does not exist", async ({
    hireApi,
  }) => {
    const res = await hireApi.listHiresRaw(999_999);
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe("Project not found");
  });

  test("returns 403 when the caller is not the project owner", async ({
    apiClient,
    request,
    runtime,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const otherUid = `intruder-${Date.now()}`;
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid,
    );
    const otherHireApi = new HireApi(otherClient);

    const res = await otherHireApi.listHiresRaw(projectId);
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  test("works after the project is archived (owner still sees their history)", async ({
    apiClient,
    request,
    runtime,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await hireApi.createHire(projectId, { tradesmanUserId: tradesmanUid });

    // Archive the project
    const archiveRes = await apiClient.post(`/api/projects/${projectId}/archive`);
    expect(archiveRes.status()).toBe(200);

    // Owner should still see the hire
    const body = await hireApi.listHires(projectId);
    expect(body.total).toBe(1);
    expect(body.items[0].tradesmanUserId).toBe(tradesmanUid);
  });
});
