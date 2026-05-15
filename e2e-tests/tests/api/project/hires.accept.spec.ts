import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

// SKIPPED 2026-05: the "hires" feature was removed from the new
// swipe-deck UI. Kept for reference if hire flows are reintroduced.
test.describe.skip("PATCH /api/hires/:id/accept", () => {
  test("tradesman accepts a pending hire", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid, tradesmanHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const hire = await hireApi.createHire(project.id, {
      tradesmanUserId: tradesmanUid,
    });

    const accepted = await tradesmanHireApi.acceptHire(hire.id, {
      tradesmanMessage: "Looking forward to it",
    });

    expect(accepted.id).toBe(hire.id);
    expect(accepted.projectId).toBe(project.id);
    expect(accepted.status).toBe("accepted");
    expect(accepted.tradesmanMessage).toBe("Looking forward to it");
    expect(accepted.respondedAt).toBeTruthy();
  });

  test("tradesman accepts without a message", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid, tradesmanHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const hire = await hireApi.createHire(project.id, {
      tradesmanUserId: tradesmanUid,
    });

    const accepted = await tradesmanHireApi.acceptHire(hire.id);

    expect(accepted.status).toBe("accepted");
    expect(accepted.tradesmanMessage).toBeNull();
  });

  test("returns 400 when tradesmanMessage exceeds the max length", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid, tradesmanHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const hire = await hireApi.createHire(project.id, {
      tradesmanUserId: tradesmanUid,
    });

    await tradesmanHireApi.expectAcceptValidationErrorForField(
      hire.id,
      { tradesmanMessage: "x".repeat(1001) },
      "tradesmanMessage",
    );
  });

  test("returns 404 when the hire id does not exist", async ({
    request,
    runtime,
  }) => {
    const { tradesmanHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const res = await tradesmanHireApi.acceptHireRaw(999_999);

    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe("Hire not found");
  });

  test("returns 403 when a different tradesman tries to accept", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: assignedTradesman } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });
    const { tradesmanHireApi: otherTradesmanHireApi } =
      await setupTradesmanProfile({
        request,
        apiBaseUrl: runtime.apiBaseUrl,
      });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const hire = await hireApi.createHire(project.id, {
      tradesmanUserId: assignedTradesman,
    });

    const res = await otherTradesmanHireApi.acceptHireRaw(hire.id);

    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  test("returns 409 HIRE_NOT_PENDING when the hire is already accepted", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid, tradesmanHireApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const hire = await hireApi.createHire(project.id, {
      tradesmanUserId: tradesmanUid,
    });

    await tradesmanHireApi.acceptHire(hire.id);

    const res = await tradesmanHireApi.acceptHireRaw(hire.id);

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("HIRE_NOT_PENDING");
    expect(body.status).toBe("accepted");
  });

  test("returns 401 when the caller is not authenticated", async ({
    request,
    runtime,
  }) => {
    // Use the bare `request` fixture (no auth headers attached) to prove the
    // route is auth-gated. The hire id is irrelevant because the auth
    // middleware rejects the request before the handler ever runs.
    const res = await request.patch(
      `${runtime.apiBaseUrl}/api/hires/9999999999/accept`,
    );
    expect(res.status()).toBe(401);
  });
});
