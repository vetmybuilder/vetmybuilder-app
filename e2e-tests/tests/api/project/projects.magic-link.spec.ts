import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/project";
import { authedApiForUid } from "../../../src/api/client";

test.describe("POST /api/projects/:id/magic-link", () => {
  test("owner can generate a magic link when project is live", async ({
    apiClient,
  }) => {
    // Owner creates a project
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();
    expect(project.id).toBeTruthy();

    // Owner publishes the project (project must be live)
    const publishRes = await apiClient.post(
      `/api/projects/${project.id}/publish`
    );
    expect(publishRes.status()).toBe(200);

    // Owner generates magic link
    const magicRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    expect(magicRes.status()).toBe(200);

    const body = await magicRes.json();

    expect(body.ok).toBe(true);
    expect(body.projectId).toBe(project.id);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(10);
    expect(typeof body.url).toBe("string");

    // URL should contain the token
    expect(body.url).toContain(body.token);
  });

  test("403 non-owner cannot generate magic link", async ({
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

    // Owner publishes project
    await apiClient.post(`/api/projects/${project.id}/publish`);

    // Different user
    const otherUid = `not-owner-${Date.now()}`;
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid
    );

    const res = await otherClient.post(
      `/api/projects/${project.id}/magic-link`
    );

    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  test("400 project must be live before generating magic link", async ({
    apiClient,
  }) => {
    // Owner creates project but does NOT publish it
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
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
    // Create + publish project
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);
    const { project } = await projectRes.json();

    await apiClient.post(`/api/projects/${project.id}/publish`);

    // First magic link
    const firstRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    expect(firstRes.status()).toBe(200);
    const firstBody = await firstRes.json();

    // Rotate magic link
    const rotateRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link?rotate=1`
    );
    expect(rotateRes.status()).toBe(200);
    const rotateBody = await rotateRes.json();

    expect(firstBody.token).not.toBe(rotateBody.token);
  });

  test("existing token is reused when rotate is not set", async ({
    apiClient,
  }) => {
    // Create + publish project
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);
    const { project } = await projectRes.json();

    await apiClient.post(`/api/projects/${project.id}/publish`);

    // First request
    const firstRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    expect(firstRes.status()).toBe(200);
    const firstBody = await firstRes.json();

    // Second request without rotate
    const secondRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    expect(secondRes.status()).toBe(200);
    const secondBody = await secondRes.json();

    expect(secondBody.token).toBe(firstBody.token);
  });
});
