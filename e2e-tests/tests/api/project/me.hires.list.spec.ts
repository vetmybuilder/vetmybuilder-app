import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Account from "../../../src/models/Account";
import Recommendation from "../../../src/models/Recommendation";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";
import { authedApiForUid } from "../../../src/api/services/client";
import HireApi from "../../../src/apiHelper/project/HireApi";

test.describe("GET /api/tradesmen/me/hires", () => {
  test("returns an empty list when the tradesman has no hires", async ({
    request,
    runtime,
  }) => {
    const { tradesmanHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const body = await tradesmanHireApi.listMyHires();

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("returns a hire with full project context and homeowner first name", async ({
    apiClient,
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    // Sign the homeowner up so they have a real firstName/lastName we can assert.
    const homeowner = Account.anAccount().withRandomDetails();
    await AuthApi.signup(apiClient, homeowner);

    const { uid: tradesmanUid, tradesmanHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await hireApi.createHire(project.id, {
      tradesmanUserId: tradesmanUid,
      homeownerMessage: "Available next week?",
    });

    const body = await tradesmanHireApi.listMyHires();

    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);

    const item = body.items[0];

    // Hire fields
    expect(item.projectId).toBe(project.id);
    expect(item.status).toBe("pending");
    expect(item.homeownerMessage).toBe("Available next week?");
    expect(item.tradesmanMessage).toBeNull();
    expect(item.respondedAt).toBeNull();
    expect(item.hiredAt).toBeTruthy();
    expect(item.expiresAt).toBeTruthy();

    // Project context
    expect(item.project).toBeTruthy();
    expect(item.project.id).toBe(project.id);
    expect(item.project.name).toBe(project.name);
    expect(item.project.location).toBe(project.location);
    expect(item.project.propertyType).toBe(project.propertyType);
    expect(item.project.bedrooms).toBe(project.bedrooms);

    // Privacy: first name only — last name, email, uid must not appear
    expect(item.project.ownerFirstName).toBe(homeowner.firstName);
    expect(item.project).not.toHaveProperty("ownerLastName");
    expect(item.project).not.toHaveProperty("ownerEmail");
    expect(item.project).not.toHaveProperty("ownerUid");
    expect(item).not.toHaveProperty("homeownerUid");

    // Trust signal — no completed projects yet
    expect(item.project.completedProjectsCount).toBe(0);
  });

  test("completedProjectsCount reflects the homeowner's history", async ({
    request,
    runtime,
    projectApi,
    projectRecommendationApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid, tradesmanHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    // Two prior projects, each completed with a chosen winner
    const priorProject1 = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const winner1 = await projectRecommendationApi.createRecommendation(
      priorProject1.id,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );
    await projectApi.completeProject(priorProject1.id, {
      winnerRecommendationId: winner1.recommendationId,
    });

    const priorProject2 = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const winner2 = await projectRecommendationApi.createRecommendation(
      priorProject2.id,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );
    await projectApi.completeProject(priorProject2.id, {
      winnerRecommendationId: winner2.recommendationId,
    });

    // A new live project the homeowner hires someone for
    const newProject = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    await hireApi.createHire(newProject.id, { tradesmanUserId: tradesmanUid });

    const body = await tradesmanHireApi.listMyHires();

    expect(body.total).toBe(1);
    expect(body.items[0].project.completedProjectsCount).toBe(2);
  });

  test("returns multiple hires sorted newest first", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid, tradesmanHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const first = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const second = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const third = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await hireApi.createHire(first.id, { tradesmanUserId: tradesmanUid });
    await hireApi.createHire(second.id, { tradesmanUserId: tradesmanUid });
    await hireApi.createHire(third.id, { tradesmanUserId: tradesmanUid });

    const body = await tradesmanHireApi.listMyHires();

    expect(body.total).toBe(3);
    expect(body.items.map((i: any) => i.projectId)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
  });

  test("only returns hires assigned to the calling tradesman", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanA, tradesmanHireApi: aHireApi } =
      await setupTradesmanProfile({ request, apiBaseUrl: runtime.apiBaseUrl });
    const { tradesmanHireApi: bHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    // Hire tradesman A only
    await hireApi.createHire(project.id, { tradesmanUserId: tradesmanA });

    // A sees the hire
    const aBody = await aHireApi.listMyHires();
    expect(aBody.total).toBe(1);
    expect(aBody.items[0].projectId).toBe(project.id);

    // B sees nothing
    const bBody = await bHireApi.listMyHires();
    expect(bBody.total).toBe(0);
  });

  test("returns 403 when the caller is not a tradesman", async ({
    request,
    runtime,
  }) => {
    // Create a brand-new authed client for a unique uid that has no chance
    // of being a tradesman. The shared apiClient fixture can accumulate
    // user_roles state across tests in the same shard (the wipe keeps
    // user_roles, and the test/auth/id-token endpoint upserts a 'user' row
    // for every authed uid), so a fresh per-test uid is the safest way to
    // assert the "not a tradesman" branch.
    const freshUid = `not-a-tradesman-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const freshClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      freshUid,
    );
    const freshHireApi = new HireApi(freshClient);

    const res = await freshHireApi.listMyHiresRaw();

    expect(res.status()).toBe(403);
  });

  test("returns 401 when the caller is not authenticated", async ({
    request,
    runtime,
  }) => {
    const res = await request.get(`${runtime.apiBaseUrl}/api/tradesmen/me/hires`);
    expect(res.status()).toBe(401);
  });
});
