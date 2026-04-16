import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Tradesman from "../../../src/models/tradesman";
import { authedApiForUid } from "../../../src/api/services/client";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";
import HireApi from "../../../src/apiHelper/project/HireApi";

test.describe("POST /api/projects/:projectId/hires", () => {
  /**
   * Creates a published project owned by `apiClient` and returns its id.
   * Most tests need this exact setup, so it lives here as a tiny helper.
   */
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

  test("creates a hire for an onboarded tradesman", async ({
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

    const hire = await hireApi.createHire(projectId, {
      tradesmanUserId: tradesmanUid,
      homeownerMessage: "Looking forward to working together",
    });

    expect(hire.projectId).toBe(projectId);
    expect(hire.tradesmanUserId).toBe(tradesmanUid);
    expect(hire.recommendationId).toBeNull();
    expect(hire.status).toBe("pending");
    expect(hire.inviteChannel).toBeNull();
    expect(hire.hiredAt).toBeTruthy();
    expect(hire.expiresAt).toBeTruthy();
  });

  test("returns 404 when the tradesman does not exist", async ({
    apiClient,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const res = await hireApi.createHireRaw(projectId, {
      tradesmanUserId: "no-such-tradesman",
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe("Tradesman not found");
  });

  test("returns 409 when the tradesman is banned", async ({
    apiClient,
    request,
    runtime,
    hireApi,
    adminApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await adminApi.setTradesmanStatus(tradesmanUid, "banned");

    const res = await hireApi.createHireRaw(projectId, {
      tradesmanUserId: tradesmanUid,
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe("TRADESMAN_BANNED");
  });

  test("returns 400 when homeowner tries to hire themselves", async ({
    apiClient,
    hireApi,
  }) => {
    // The owner of `apiClient` is also a tradesman in this test
    const tm = Tradesman.aTradesman().withRandomDetails();
    const putRes = await apiClient.put("/api/tradesmen/me", tm.toPayload());
    expect(putRes.status()).toBe(200);

    const projectId = await liveProjectForOwner(apiClient);

    const meRes = await apiClient.get("/api/me");
    const meBody = await meRes.json();
    const myUid = meBody?.uid || meBody?.user?.uid;
    expect(myUid).toBeTruthy();

    const res = await hireApi.createHireRaw(projectId, {
      tradesmanUserId: myUid,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("CANNOT_HIRE_SELF");
  });

  test("returns 409 ALREADY_HIRED when the same tradesman is hired twice", async ({
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

    const res = await hireApi.createHireRaw(projectId, {
      tradesmanUserId: tradesmanUid,
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe("ALREADY_HIRED");
  });

  test("creates a hire for a recommendation that has companyEmail (channel=email)", async ({
    apiClient,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const companyEmail = `hire-rec+${Date.now()}@elegant.test`;
    const recRes = await apiClient.post(
      `/api/projects/${projectId}/recommendations`,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withCompanyEmail(companyEmail)
        .toPayload(),
    );
    expect(recRes.status()).toBe(201);
    const { recommendationId } = await recRes.json();

    const hire = await hireApi.createHire(projectId, {
      recommendationId,
      homeownerMessage: "Heard great things about you",
    });

    expect(hire.projectId).toBe(projectId);
    expect(hire.tradesmanUserId).toBeNull();
    expect(hire.recommendationId).toBe(recommendationId);
    expect(hire.status).toBe("pending_invite");
    expect(hire.inviteChannel).toBe("email");
  });

  test("auto-matches a recommendation to an onboarded tradesman by company name", async ({
    apiClient,
    request,
    runtime,
    projectRecommendationApi,
    hireApi,
  }) => {
    // Onboard a tradesman with a known company name
    const knownCompanyName = `AutoMatch Tradesmen Co ${Date.now()}`;
    const tradesmanModel = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(knownCompanyName);

    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: tradesmanModel,
    });

    // Create a published project owned by apiClient (the homeowner)
    const projectId = await liveProjectForOwner(apiClient);

    // Create a recommendation with the SAME company name + " Limited" suffix
    // to prove the suffix-stripping match works
    const rec = await projectRecommendationApi.createRecommendation(
      projectId,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withCompany(`${knownCompanyName} Limited`)
        .toPayload(),
    );

    const hire = await hireApi.createHire(projectId, {
      recommendationId: rec.recommendationId,
    });

    // The hire should be onboarded (status='pending') and linked to BOTH
    // the recommendation AND the matched tradesman
    expect(hire.status).toBe("pending");
    expect(hire.tradesmanUserId).toBe(tradesmanUid);
    expect(hire.recommendationId).toBe(rec.recommendationId);
    expect(hire.projectId).toBe(projectId);
    expect(hire.inviteChannel).toBeNull();
  });

  test("creates a hire for a recommendation without companyEmail (channel=manual)", async ({
    apiClient,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const rec = Recommendation.aRecommendation()
      .withRandomDetails()
      .withCompany(`NoMatch Manual Hire Co ${Date.now()}`);
    const recRes = await apiClient.post(
      `/api/projects/${projectId}/recommendations`,
      rec.toPayload(),
    );
    expect(recRes.status()).toBe(201);
    const { recommendationId } = await recRes.json();

    const hire = await hireApi.createHire(projectId, { recommendationId });

    expect(hire.status).toBe("pending_invite");
    expect(hire.inviteChannel).toBe("manual");
  });

  test("returns 404 when the recommendation does not exist", async ({
    apiClient,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const res = await hireApi.createHireRaw(projectId, {
      recommendationId: 999_999,
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe("Recommendation not found");
  });

  test("returns 404 when the recommendation belongs to a different project", async ({
    apiClient,
    hireApi,
  }) => {
    const projectAId = await liveProjectForOwner(apiClient);
    const projectBId = await liveProjectForOwner(apiClient);

    // Create the recommendation against project A
    const recRes = await apiClient.post(
      `/api/projects/${projectAId}/recommendations`,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );
    expect(recRes.status()).toBe(201);
    const { recommendationId } = await recRes.json();

    // Try to hire from project B
    const res = await hireApi.createHireRaw(projectBId, {
      recommendationId,
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe("Recommendation not found");
  });

  test("returns 409 ALREADY_HIRED when the same recommendation is hired twice", async ({
    apiClient,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    const rec = Recommendation.aRecommendation()
      .withRandomDetails()
      .withCompany(`NoMatch Dup Hire Co ${Date.now()}`);
    const recRes = await apiClient.post(
      `/api/projects/${projectId}/recommendations`,
      rec.toPayload(),
    );
    const { recommendationId } = await recRes.json();

    await hireApi.createHire(projectId, { recommendationId });

    const res = await hireApi.createHireRaw(projectId, { recommendationId });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe("ALREADY_HIRED");
  });

  test("returns 400 when neither tradesmanUserId nor recommendationId is provided", async ({
    apiClient,
    hireApi,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);

    await hireApi.expectValidationErrorForField(
      projectId,
      {},
      "tradesmanUserId",
    );
  });

  test("returns 400 when both tradesmanUserId and recommendationId are provided", async ({
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

    const recRes = await apiClient.post(
      `/api/projects/${projectId}/recommendations`,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );
    const { recommendationId } = await recRes.json();

    await hireApi.expectValidationErrorForField(
      projectId,
      { tradesmanUserId: tradesmanUid, recommendationId },
      "tradesmanUserId",
    );
  });


  test("returns 404 when the project does not exist", async ({
    apiClient,
    request,
    runtime,
    hireApi,
  }) => {
    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const res = await hireApi.createHireRaw(999_999, {
      tradesmanUserId: tradesmanUid,
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe("Project not found");
  });

  test("returns 403 when the caller is not the project owner", async ({
    apiClient,
    request,
    runtime,
  }) => {
    const projectId = await liveProjectForOwner(apiClient);
    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    // A different user tries to create a hire on someone else's project
    const otherUid = `intruder-${Date.now()}`;
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid,
    );
    const otherHireApi = new HireApi(otherClient);

    const res = await otherHireApi.createHireRaw(projectId, {
      tradesmanUserId: tradesmanUid,
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  test("returns 409 PROJECT_NOT_HIREABLE when the project is not live", async ({
    apiClient,
    request,
    runtime,
    hireApi,
  }) => {
    // Create a project but DO NOT publish it (status will be 'draft')
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);
    const { project } = await projectRes.json();

    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const res = await hireApi.createHireRaw(project.id, {
      tradesmanUserId: tradesmanUid,
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("PROJECT_NOT_HIREABLE");
    expect(body.status).toBeTruthy();
  });
});
