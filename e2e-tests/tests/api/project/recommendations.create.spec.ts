import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/project";
import Recommendation from "../../../src/models/Recommendation";
import { authedApiForUid } from "../../../src/api/client";

test.describe("POST /api/projects/:id/recommendations", () => {
  test("creates a recommendation", async ({ apiClient }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const rec = Recommendation.aRecommendation().withRandomDetails();

    const res = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      rec.toPayload()
    );
    expect(res.status()).toBe(201);

    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.recommendationId).toBeTruthy();
    expect(body.resolvedCompany).toBeTruthy();
    expect(body.resolvedBy).toBeTruthy();
    expect(body.recommender.source).toBe("platform");
  });

  test("400 Invalid id", async ({ apiClient }) => {
    const rec = Recommendation.aRecommendation().withRandomDetails();

    const res = await apiClient.post(
      "/api/projects/nope/recommendations",
      rec.toPayload()
    );

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid id" });
  });

  test("400 Invalid payload", async ({ apiClient }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const res = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      {
        name: "",
        company: "",
        comment: "",
      }
    );

    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Invalid payload");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  test("owner creates recommendation. relation=owner and source=platform", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const rec = Recommendation.aRecommendation().withRandomDetails();

    const res = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      rec.toPayload()
    );
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.recommender.source).toBe("platform");
    expect(body.recommender.relation).toBe("owner");
  });

  test("unauthenticated magic recommendation. relation=friend and source=magic", async ({
    request,
    runtime,
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const rec = Recommendation.aRecommendation()
      .withRandomDetails()
      .withSource("magic");

    const res = await request.post(
      `${runtime.apiBaseUrl}/api/projects/${project.id}/recommendations`,
      { data: rec.toPayload() }
    );

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.recommender.source).toBe("magic");
    expect(body.recommender.relation).toBe("friend");
  });

  test("company resolution uses DB canonical name (resolvedBy=db)", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const canonical = "Acme Plumbing Ltd";

    await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withCompany(canonical)
        .toPayload()
    );

    const secondRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withCompany("acme plumbing ltd")
        .toPayload()
    );

    const body = await secondRes.json();
    expect(body.resolvedBy).toBe("db");
    expect(body.resolvedCompany).toBe(canonical);
  });

  test("can upload photos with a recommendation", async ({ apiClient }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const rec = Recommendation.aRecommendation()
      .withRandomDetails()
      .withEmail("rec@test.com")
      .withPhone("07123456789")
      .withSource("platform")
      .withPhotos(2);

    const res = await apiClient.postMultipart(
      `/api/projects/${project.id}/recommendations`,
      rec.toMultipartPayload()
    );

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);

    const created = await apiClient.getProjectRecommendation(
      project.id,
      body.recommendationId
    );

    expect(created).toBeTruthy();
    expect(created.company).toBe(rec.company);
    expect(created.comment).toBe(rec.comment);
    expect(created.rating).toBe(5);
    expect(created.fromFriend).toBe(false);
  });

  test("non-owner can view recommendations when project is live", async ({
    apiClient,
    request,
    runtime,
  }) => {
    // Owner creates project
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    // Owner publishes project (makes it live)
    const publishRes = await apiClient.post(
      `/api/projects/${project.id}/publish`
    );
    expect(publishRes.status()).toBe(200);

    // Owner adds a recommendation
    const recRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation().withRandomDetails().toPayload()
    );
    expect(recRes.status()).toBe(201);

    const { recommendationId } = await recRes.json();
    expect(recommendationId).toBeTruthy();

    // Different user (non-owner)
    const otherUid = `viewer-${Date.now()}`;
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid
    );

    // Non-owner can now view recommendations because project is live
    const getRes = await otherClient.get(
      `/api/projects/${project.id}/recommendations`
    );
    expect(getRes.status()).toBe(200);

    const body = await getRes.json();
    expect(body.total).toBeGreaterThan(0);
  });

  test("non-owner cannot view recommendations when project is not live or completed", async ({
    apiClient,
    request,
    runtime,
  }) => {
    // Owner creates project (defaults to draft)
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    // Owner adds a recommendation (owner can do this)
    const recRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation().withRandomDetails().toPayload()
    );
    expect(recRes.status()).toBe(201);

    // Different user (non-owner)
    const otherUid = `viewer-${Date.now()}`;
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid
    );

    // Non-owner should NOT be able to view because project is still draft
    const getRes = await otherClient.get(
      `/api/projects/${project.id}/recommendations`
    );

    expect(getRes.status()).toBe(404);
    expect(await getRes.json()).toEqual({ error: "Not found" });
  });
});
