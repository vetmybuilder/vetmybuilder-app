import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Tradesman from "../../../src/models/tradesman";
import { authedApiForUid } from "../../../src/api/services/client";
import Account from "../../../src/models/Account";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

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

  test("winner_tradesman_uid is auto-resolved from recommendation company name on close", async ({
    apiClient,
    request,
    runtime,
  }) => {
    // Register a tradesman whose company name matches the recommendation
    const companyName = `Auto-Resolve Co ${Date.now()}`;
    const tradesmanUid = `tm-autoresolve-${Date.now()}`;
    const tradesmanClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      tradesmanUid,
    );
    const putRes = await tradesmanClient.put(
      "/api/tradesmen/me",
      Tradesman.aTradesman().withRandomDetails().withCompanyName(companyName).toPayload(),
    );
    expect(putRes.status()).toBe(200);

    // Create a project and add a recommendation using that company name
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);
    const { project } = await projectRes.json();

    const recRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation().withRandomDetails().withCompany(companyName).toPayload(),
    );
    expect(recRes.status()).toBe(201);
    const { recommendationId } = await recRes.json();

    // Close the project with only winnerRecommendationId — no winnerTradesmanUid
    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      winnerRecommendationId: recommendationId,
      wouldUseAgain: true,
    });
    expect(closeRes.status()).toBe(200);
    const closeBody = await closeRes.json();
    expect(closeBody.ok).toBe(true);
    expect(closeBody.project.status).toBe("completed");

    // Verify winner_tradesman_uid was auto-resolved by checking the completed tab.
    // GET /api/projects?tab=completed returns _winnerTradesmanUid via JOIN on project_closures.
    const listRes = await apiClient.get("/api/projects?tab=completed");
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();

    const found = (listBody.items as any[]).find((p: any) => p.id === project.id);
    expect(found).toBeTruthy();
    expect(found._winnerTradesmanUid).toBe(tradesmanUid);
  });

  test("project_closed_local notification is sent to nearby users after a completed close", async ({
    apiClient,
    request,
    runtime,
  }) => {
    // Create the project (default location "E4 0BQ" from Project fixture)
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
    const { recommendationId } = await recRes.json();

    // Register a neighbour in the same outward code area before closing
    const neighbourUid = `neighbour-notif-${Date.now()}`;
    const neighbourClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      neighbourUid,
    );
    const neighbour = Account.anAccount()
      .withRandomDetails()
      .withLocation("E4");
    await AuthApi.signup(neighbourClient, neighbour);

    // Close the project as completed — this should trigger the notification
    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      winnerRecommendationId: recommendationId,
      wouldUseAgain: true,
    });
    expect(closeRes.status()).toBe(200);
    expect((await closeRes.json()).project.status).toBe("completed");

    // Poll the neighbour's notifications for the project_closed_local entry
    // (the notification is written in a background async block so we allow a short delay)
    await expect
      .poll(
        async () => {
          const notifRes = await neighbourClient.get("/api/notifications");
          if (notifRes.status() !== 200) return false;
          const { items } = await notifRes.json();
          return (items as any[]).some(
            (n) =>
              n.type === "project_closed_local" &&
              n.projectId === project.id,
          );
        },
        { timeout: 5_000, intervals: [300, 500, 800, 1000] },
      )
      .toBe(true);
  });
});
