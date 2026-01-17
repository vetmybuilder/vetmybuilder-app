import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/project";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("POST /api/projects/:id/publish", () => {
  test("owner can publish a pending project and publishing is idempotent", async ({
    apiClient,
  }) => {
    const createRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createRes.status()).toBe(201);

    const { project: created } = await createRes.json();
    const projectId = created.id;

    const publishRes = await apiClient.post(
      `/api/projects/${projectId}/publish`,
      {},
    );
    expect(publishRes.status()).toBe(200);

    const { project: published } = await publishRes.json();
    expect(published.id).toBe(projectId);
    expect(published.status).toBe("live");

    const publishAgainRes = await apiClient.post(
      `/api/projects/${projectId}/publish`,
      {},
    );
    expect(publishAgainRes.status()).toBe(200);

    const { project: publishedAgain } = await publishAgainRes.json();
    expect(publishedAgain.id).toBe(projectId);
    expect(publishedAgain.status).toBe("live");
  });

  test("400 if id is invalid", async ({ apiClient }) => {
    const res = await apiClient.post("/api/projects/nope/publish", {});
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid id" });
  });

  test("404 if project not found", async ({ apiClient }) => {
    const res = await apiClient.post("/api/projects/999999999/publish", {});
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  test("403 if not owner", async ({ apiClient, request, runtime }) => {
    const createRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createRes.status()).toBe(201);

    const { project: created } = await createRes.json();
    const projectId = created.id;

    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      `other-owner-${Date.now()}`,
    );

    const res = await otherClient.post(
      `/api/projects/${projectId}/publish`,
      {},
    );
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});
