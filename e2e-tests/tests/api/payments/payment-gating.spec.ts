import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import { TEST_CARD } from "../../../src/helpers/testCard";

test.describe("Payment gating for tradespeople", () => {
  test("owner cannot request their own contact", async ({
    apiClient,
    projectApi,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    const res = await apiClient.get(`/api/projects/${created.id}/owner-contact`);
    const body = await res.json();
    expect(body.error).toBe("owner_cannot_request_own_contact");
  });

  test("unlock checkout creates a session for a live project", async ({
    apiClient,
    projectApi,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    const res = await apiClient.post(`/api/projects/${created.id}/unlock-contact/checkout`);
    expect(res.ok()).toBe(true);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBeTruthy();
    expect(body.url).toContain("/payments/mock/checkout/");
  });

  test("duplicate unlock returns alreadyUnlocked", async ({
    apiClient,
    projectApi,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    const { sessionId } = await (await apiClient.post(`/api/projects/${created.id}/unlock-contact/checkout`)).json();

    await apiClient.post(`/api/payments/mock/pay`, {
      sessionId,
      card: TEST_CARD,
    });

    const res = await apiClient.post(`/api/projects/${created.id}/unlock-contact/checkout`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyUnlocked).toBe(true);
  });

  test("mock payment creates active unlock record", async ({
    apiClient,
    projectApi,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    const { sessionId } = await (await apiClient.post(`/api/projects/${created.id}/unlock-contact/checkout`)).json();

    const payRes = await apiClient.post(`/api/payments/mock/pay`, {
      sessionId,
      card: TEST_CARD,
    });
    expect(payRes.ok()).toBe(true);

    const body = await payRes.json();
    expect(body.ok).toBe(true);
    expect(body.type).toBe("unlock_contact");
    expect(body.status).toBe("active");
    expect(body.projectId).toBe(created.id);
  });

  test("checkout fails for non-live project", async ({
    apiClient,
    projectApi,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await apiClient.post(`/api/projects/${created.id}/close`, {
      selectedBuilderId: null,
      wouldUseAgain: false,
    });

    const res = await apiClient.post(`/api/projects/${created.id}/unlock-contact/checkout`);
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("live");
  });
});
