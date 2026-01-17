import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/project";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("POST /api/projects/:id/magic-link", () => {
  test("owner can generate a magic link when project is live", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();
    expect(project.id).toBeTruthy();

    const publishRes = await apiClient.post(
      `/api/projects/${project.id}/publish`,
    );
    expect(publishRes.status()).toBe(200);

    const magicRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`,
    );
    expect(magicRes.status()).toBe(200);

    const body = await magicRes.json();

    expect(body.ok).toBe(true);
    expect(body.projectId).toBe(project.id);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(10);
    expect(typeof body.url).toBe("string");
    expect(body.url).toContain(body.token);
  });

  test("403 non-owner cannot generate magic link", async ({
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

    const publishRes = await apiClient.post(
      `/api/projects/${project.id}/publish`,
    );
    expect(publishRes.status()).toBe(200);

    const otherUid = `not-owner-${Date.now()}`;
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid,
    );

    const res = await otherClient.post(
      `/api/projects/${project.id}/magic-link`,
    );

    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  test("400 project must be live before generating magic link", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const res = await apiClient.post(`/api/projects/${project.id}/magic-link`);

    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("project_not_live");
  });

  test("404 project not found", async ({ apiClient }) => {
    const res = await apiClient.post("/api/projects/99999999/magic-link");

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  test("rotate=1 generates a new token", async ({ apiClient }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const publishRes = await apiClient.post(
      `/api/projects/${project.id}/publish`,
    );
    expect(publishRes.status()).toBe(200);

    const firstRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`,
    );
    expect(firstRes.status()).toBe(200);

    const firstBody = await firstRes.json();

    const rotateRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link?rotate=1`,
    );
    expect(rotateRes.status()).toBe(200);

    const rotateBody = await rotateRes.json();

    expect(firstBody.token).not.toBe(rotateBody.token);
  });

  test("existing token is reused when rotate is not set", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const publishRes = await apiClient.post(
      `/api/projects/${project.id}/publish`,
    );
    expect(publishRes.status()).toBe(200);

    const firstRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`,
    );
    expect(firstRes.status()).toBe(200);

    const firstBody = await firstRes.json();

    const secondRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`,
    );
    expect(secondRes.status()).toBe(200);

    const secondBody = await secondRes.json();

    expect(secondBody.token).toBe(firstBody.token);
  });
});
