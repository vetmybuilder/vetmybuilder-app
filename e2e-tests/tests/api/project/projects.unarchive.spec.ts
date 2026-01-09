import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/project";
import { authedApiForUid } from "../../../src/api/client";

test.describe("POST /api/projects/:id/unarchive", () => {
  test("owner can unarchive a project and status becomes pending", async ({
    apiClient,
  }) => {
    // Create project
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    // Archive it first (didGoAhead=false -> archived)
    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: false,
      reasons: ["budget"],
    });
    expect(closeRes.status()).toBe(200);

    const closeBody = await closeRes.json();
    expect(closeBody.ok).toBe(true);
    expect(closeBody.project.status).toBe("archived");

    // Unarchive -> pending
    const unarchiveRes = await apiClient.post(
      `/api/projects/${project.id}/unarchive`
    );
    expect(unarchiveRes.status()).toBe(200);

    const body = await unarchiveRes.json();
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBe(project.id);
    expect(body.project.status).toBe("pending");
  });

  test("400 Invalid id", async ({ apiClient }) => {
    const res = await apiClient.post("/api/projects/nope/unarchive");

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid id" });
  });

  test("404 Not found", async ({ apiClient }) => {
    const res = await apiClient.post("/api/projects/99999999/unarchive");

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  test("403 Forbidden when user is not the owner", async ({
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

    // Different user
    const otherUid = `not-owner-${Date.now()}`;
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid
    );

    // Non-owner tries to unarchive
    const res = await otherClient.post(`/api/projects/${project.id}/unarchive`);

    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  test("returns 401 when user is not authenticated", async ({
    apiClient,
    request,
    runtime,
  }) => {
    // Create project as owner
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    // No auth header on purpose
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/projects/${project.id}/unarchive`
    );

    expect(res.status()).toBe(401);
  });

  test("unarchiving a non-archived project still sets status to pending", async ({
    apiClient,
  }) => {
    // Create project (likely starts as draft/pending depending on your system)
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    // Call unarchive anyway
    const res = await apiClient.post(`/api/projects/${project.id}/unarchive`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBe(project.id);
    expect(body.project.status).toBe("pending");
  });
});
