import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";

test.describe("POST /api/recommendations/magic/:token", () => {
  test("unauthenticated user can add recommendation via magic link", async ({
    apiClient,
    request,
  }, testInfo) => {
    const baseURL = (testInfo?.project?.use as any)?.baseURL as string;
    if (!baseURL) throw new Error("Missing project baseURL");

    // Owner creates project
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    // Project must be live
    await apiClient.post(`/api/projects/${project.id}/publish`);

    // Owner generates magic link
    const magicRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    expect(magicRes.status()).toBe(200);

    const { token } = await magicRes.json();
    expect(token).toBeTruthy();

    // Friend submits recommendation using magic link
    const rec = Recommendation.aRecommendation()
      .withRandomDetails()
      .withSource("magic");

    const res = await request.post(
      `${baseURL}/api/recommendations/magic/${token}`,
      { data: rec.toPayload() }
    );

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.recommender.source).toBe("magic");
    expect(body.recommender.relation).toBe("friend");
  });

  test("404 invalid magic token", async ({ request }, testInfo) => {
    const baseURL = (testInfo?.project?.use as any)?.baseURL as string;
    if (!baseURL) throw new Error("Missing project baseURL");

    const res = await request.post(
      `${baseURL}/api/recommendations/magic/this-token-does-not-exist`,
      { data: { any: "payload" } } // keep your existing payload if you have one
    );

    expect(res.status()).toBe(404);
  });

  test("magic link cannot be used after rotation", async ({
    apiClient,
    request,
    runtime,
  }) => {
    // Owner creates + publishes project
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const publishRes = await apiClient.post(
      `/api/projects/${project.id}/publish`
    );
    expect(publishRes.status()).toBe(200);

    // Create initial magic link
    const firstLinkRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    expect(firstLinkRes.status()).toBe(200);

    const firstLinkBody = await firstLinkRes.json();
    expect(firstLinkBody.token).toBeTruthy();

    const oldToken = firstLinkBody.token;

    // Rotate token
    const rotateRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link?rotate=1`
    );
    expect(rotateRes.status()).toBe(200);

    const rotateBody = await rotateRes.json();
    expect(rotateBody.token).toBeTruthy();
    expect(rotateBody.token).not.toBe(oldToken);

    // Old token should now be invalid
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/recommendations/magic/${oldToken}`,
      {
        data: {
          name: "Test User",
          company: "Test Co",
          comment: "This should fail because the token was rotated",
        },
      }
    );

    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Invalid or expired link token.");
  });

  test("magic link token is reused when rotate is not requested", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    const { project } = await projectRes.json();

    await apiClient.post(`/api/projects/${project.id}/publish`);

    const first = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    const { token: token1 } = await first.json();

    const second = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    const { token: token2 } = await second.json();

    expect(token1).toBe(token2);
  });

  test("cannot submit magic recommendation when project is not live", async ({
    apiClient,
    projectApi,
    request,
    runtime,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    const { project } = await projectRes.json();

    // Close the project (archived = not live) so magic-link request is rejected
    await projectApi.closeProject(project.id, { didGoAhead: false });

    const magicRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );

    expect(magicRes.status()).toBe(400);
    expect(await magicRes.json()).toEqual({
      error: "project_not_live",
      message: "Project must be live before inviting recommendations.",
    });
  });

  test("magic recommendation is rejected when project is completed", async ({
    apiClient,
    request,
    runtime,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    // Project must be live to generate a magic link
    const publishRes = await apiClient.post(
      `/api/projects/${project.id}/publish`
    );
    expect(publishRes.status()).toBe(200);

    const linkRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    expect(linkRes.status()).toBe(200);

    const { token } = await linkRes.json();
    expect(token).toBeTruthy();

    // Close project as completed (winnerTradesmanUid is enough to complete)
    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      winnerTradesmanUid: "some-tradesman-uid",
    });
    expect(closeRes.status()).toBe(200);

    const closeBody = await closeRes.json();
    expect(closeBody.ok).toBe(true);
    expect(closeBody.project.status).toBe("completed");

    // Magic recommendation should now be rejected because project is no longer live
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/recommendations/magic/${token}`,
      {
        data: Recommendation.aRecommendation()
          .withRandomDetails()
          .withSource("magic")
          .toPayload(),
      }
    );

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({
      error: "This project is not accepting recommendations yet.",
    });
  });

  test("magic recommendation is rejected when project is archived", async ({
    apiClient,
    request,
    runtime,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    // Project must be live to generate magic link
    await apiClient.post(`/api/projects/${project.id}/publish`);

    const linkRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    const { token } = await linkRes.json();

    // Archive project (did not go ahead)
    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: false,
      reasons: ["budget"],
    });
    expect(closeRes.status()).toBe(200);

    // Magic recommendation should now be rejected
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/recommendations/magic/${token}`,
      {
        data: Recommendation.aRecommendation()
          .withRandomDetails()
          .withSource("magic")
          .toPayload(),
      }
    );

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({
      error: "This project is not accepting recommendations yet.",
    });
  });

  test("magic recommendation returns 400 for invalid payload", async ({
    apiClient,
    request,
    runtime,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    const { project } = await projectRes.json();

    await apiClient.post(`/api/projects/${project.id}/publish`);

    const linkRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    const { token } = await linkRes.json();

    // Invalid payload: missing company, short comment
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/recommendations/magic/${token}`,
      {
        data: {
          name: "Test User",
          company: "",
          comment: "too short",
        },
      }
    );

    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Invalid payload");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  test("authenticated magic recommendation sets relation=neighbour", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload()
    );
    const { project } = await projectRes.json();

    await apiClient.post(`/api/projects/${project.id}/publish`);

    const linkRes = await apiClient.post(
      `/api/projects/${project.id}/magic-link`
    );
    const { token } = await linkRes.json();

    // Authenticated user uses magic link
    const res = await apiClient.post(
      `/api/recommendations/magic/${token}`,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withSource("magic")
        .toPayload()
    );

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.recommender.source).toBe("magic");
    expect(body.recommender.relation).toBe("neighbour");
  });
});
