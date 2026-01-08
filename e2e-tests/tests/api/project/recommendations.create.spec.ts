import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/project";
import Recommendation from "../../../src/models/recommendation";

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

    expect(body.recommender).toBeTruthy();
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
    expect(body.ok).toBe(true);
    expect(body.recommendationId).toBeTruthy();
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
      {
        data: rec.toPayload(),
      }
    );

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
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

    const first = Recommendation.aRecommendation()
      .withRandomDetails()
      .withCompany(canonical);

    const firstRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      first.toPayload()
    );
    expect(firstRes.status()).toBe(201);

    const second = Recommendation.aRecommendation()
      .withRandomDetails()
      .withCompany("acme plumbing ltd"); // different casing

    const secondRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      second.toPayload()
    );
    expect(secondRes.status()).toBe(201);

    const body = await secondRes.json();
    expect(body.ok).toBe(true);
    expect(body.resolvedBy).toBe("db");
    expect(body.resolvedCompany).toBe(canonical);
  });
});
