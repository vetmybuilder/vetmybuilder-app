import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("POST /api/projects/:id/close", () => {
  test("owner can close a project as completed when didGoAhead=true and winnerRecommendationId is provided", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const recRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );
    expect(recRes.status()).toBe(201);

    const recBody = await recRes.json();
    expect(recBody.recommendationId).toBeTruthy();

    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      winnerRecommendationId: recBody.recommendationId,
      wouldUseAgain: true,
      reasons: [],
    });

    expect(closeRes.status()).toBe(200);

    const closeBody = await closeRes.json();
    expect(closeBody.ok).toBe(true);
    expect(closeBody.project).toBeTruthy();
    expect(closeBody.project.status).toBe("completed");
  });

  test("didGoAhead=false archives the project", async ({ apiClient }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: false,
      reasons: ["budget"],
    });

    expect(closeRes.status()).toBe(200);

    const body = await closeRes.json();
    expect(body.ok).toBe(true);
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBe(project.id);
    expect(body.project.status).toBe("archived");
  });

  test("400 invalid project id", async ({ apiClient }) => {
    const res = await apiClient.post("/api/projects/nope/close", {
      didGoAhead: false,
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_id" });
  });

  test("404 project not found", async ({ apiClient }) => {
    const nonExistentId = 99999999;

    const res = await apiClient.post(`/api/projects/${nonExistentId}/close`, {
      didGoAhead: false,
    });

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  test("403 non-owner cannot close project", async ({
    apiClient,
    request,
    runtime,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const otherUid = `not-owner-${Date.now()}`;
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid,
    );

    const res = await otherClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: false,
    });

    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  test("didGoAhead=true with no winner archives the project", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      reasons: ["budget"],
    });

    expect(closeRes.status()).toBe(200);

    const body = await closeRes.json();
    expect(body.ok).toBe(true);
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBe(project.id);
    expect(body.project.status).toBe("archived");
  });

  test("winner can be provided as selectedRecommendationId (still completes)", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const recRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );
    expect(recRes.status()).toBe(201);

    const recBody = await recRes.json();
    expect(recBody.recommendationId).toBeTruthy();

    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      selectedRecommendationId: recBody.recommendationId,
      wouldUseAgain: true,
    });

    expect(closeRes.status()).toBe(200);

    const body = await closeRes.json();
    expect(body.ok).toBe(true);
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBe(project.id);
    expect(body.project.status).toBe("completed");
  });

  test("didGoAhead=true with winnerTradesmanUid (no recommendation id) completes the project", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      winnerTradesmanUid: `tradesman-${Date.now()}`,
      winnerFromCommunity: true,
      wouldUseAgain: "true",
    });

    expect(closeRes.status()).toBe(200);

    const body = await closeRes.json();
    expect(body.ok).toBe(true);
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBe(project.id);
    expect(body.project.status).toBe("completed");
  });
});
