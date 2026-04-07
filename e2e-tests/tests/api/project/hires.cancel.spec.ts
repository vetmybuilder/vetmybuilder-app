import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import HireApi from "../../../src/apiHelper/project/HireApi";
import { authedApiForUid } from "../../../src/api/services/client";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

test.describe("PATCH /api/hires/:id/cancel", () => {
  /* ----------------------------------------------------------------------
   * Pre-acceptance cancellation
   * -------------------------------------------------------------------- */

  test("homeowner cancels a pending hire (no reason needed)", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const hire = await hireApi.createHire(project.id, {
      tradesmanUserId: tradesmanUid,
    });

    const cancelled = await hireApi.cancelHire(hire.id);

    expect(cancelled.id).toBe(hire.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBeNull();
    expect(cancelled.cancelledAt).toBeTruthy();
  });

  test("homeowner cancels a pending_invite (recommendation) hire", async ({
    apiClient,
    projectApi,
    hireApi,
  }) => {
    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const recRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );
    const { recommendationId } = await recRes.json();

    const hire = await hireApi.createHire(project.id, { recommendationId });

    const cancelled = await hireApi.cancelHire(hire.id);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBeNull();
  });

  /* ----------------------------------------------------------------------
   * Post-acceptance cancellation
   * -------------------------------------------------------------------- */

  test("homeowner cancels an accepted hire WITH a reason", async ({
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

    const cancelled = await hireApi.cancelHire(hire.id, {
      cancelReason: "changed_mind",
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("changed_mind");
    expect(cancelled.cancelledAt).toBeTruthy();
  });

  test("returns 400 CANCEL_REASON_REQUIRED when cancelling an accepted hire without a reason", async ({
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

    const res = await hireApi.cancelHireRaw(hire.id);

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("CANCEL_REASON_REQUIRED");
  });

  /* ----------------------------------------------------------------------
   * Validation
   * -------------------------------------------------------------------- */

  test("returns 400 when cancelReason is not in the canonical enum", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const hire = await hireApi.createHire(project.id, {
      tradesmanUserId: tradesmanUid,
    });

    await hireApi.expectCancelValidationErrorForField(
      hire.id,
      { cancelReason: "random_string" },
      "cancelReason",
    );
  });

  /* ----------------------------------------------------------------------
   * Authorization & state guards
   * -------------------------------------------------------------------- */

  test("returns 404 when the hire id does not exist", async ({ hireApi }) => {
    const res = await hireApi.cancelHireRaw(999_999);

    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe("Hire not found");
  });

  test("returns 403 when a different homeowner tries to cancel", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const hire = await hireApi.createHire(project.id, {
      tradesmanUserId: tradesmanUid,
    });

    // Different homeowner uid
    const intruderUid = `intruder-${Date.now()}`;
    const intruderClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      intruderUid,
    );
    const intruderHireApi = new HireApi(intruderClient);

    const res = await intruderHireApi.cancelHireRaw(hire.id);

    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  test("returns 401 when the caller is not authenticated", async ({
    request,
    runtime,
  }) => {
    // Use the bare `request` fixture (no auth headers attached) to prove the
    // route is auth-gated. The hire id is irrelevant because the auth
    // middleware rejects the request before the handler ever runs.
    const res = await request.patch(
      `${runtime.apiBaseUrl}/api/hires/9999999999/cancel`,
    );
    expect(res.status()).toBe(401);
  });

  test("returns 409 HIRE_NOT_CANCELLABLE when the hire is already declined", async ({
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

    await tradesmanHireApi.declineHire(hire.id);

    const res = await hireApi.cancelHireRaw(hire.id);

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("HIRE_NOT_CANCELLABLE");
    expect(body.status).toBe("declined");
  });

  test("returns 409 HIRE_NOT_CANCELLABLE when the hire is already cancelled", async ({
    request,
    runtime,
    projectApi,
    hireApi,
  }) => {
    const { uid: tradesmanUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    const hire = await hireApi.createHire(project.id, {
      tradesmanUserId: tradesmanUid,
    });

    await hireApi.cancelHire(hire.id);

    const res = await hireApi.cancelHireRaw(hire.id);

    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe("HIRE_NOT_CANCELLABLE");
  });
});
