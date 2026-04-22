import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("PUT /api/projects/:id", () => {
  test("owner can update a project (happy path)", async ({ apiClient }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);

    const { project: created } = await createdRes.json();

    await new Promise((r) => setTimeout(r, 1100));

    const update = {
      name: "Updated Project Name",
      type: "Kitchen",
      description: "Updated description",
      propertyType: "Flat",
      bedrooms: 2,
    };

    const res = await apiClient.put(`/api/projects/${created.id}`, update);
    expect(res.status()).toBe(200);

    const { project } = await res.json();
    expect(project.id).toBe(created.id);
    expect(project.name).toBe(update.name);
    expect(project.type).toBe(update.type);
    expect(project.description).toBe(update.description);
    expect(project.propertyType).toBe(update.propertyType);
    expect(project.bedrooms).toBe(update.bedrooms);

    expect(project.createdAt).toBeTruthy();
    expect(project.updatedAt).toBeTruthy();
    expect(project.updatedAt).not.toBe(project.createdAt);

    const createdAtMs = new Date(project.createdAt).getTime();
    const updatedAtMs = new Date(project.updatedAt).getTime();
    expect(updatedAtMs).toBeGreaterThanOrEqual(createdAtMs);
  });

  test("supports partial update (merges with current values)", async ({
    apiClient,
  }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);

    const { project: created } = await createdRes.json();

    await new Promise((r) => setTimeout(r, 1100));

    const res = await apiClient.put(`/api/projects/${created.id}`, {
      description: "Only description changed",
    });
    expect(res.status()).toBe(200);

    const { project } = await res.json();
    expect(project.id).toBe(created.id);

    expect(project.description).toBe("Only description changed");
    expect(project.name).toBe(created.name);
    expect(project.type).toBe(created.type);
    expect(project.propertyType).toBe(created.propertyType);
    expect(project.bedrooms).toBe(created.bedrooms);

    expect(project.createdAt).toBeTruthy();
    expect(project.updatedAt).toBeTruthy();
    expect(project.updatedAt).not.toBe(project.createdAt);

    const createdAtMs = new Date(project.createdAt).getTime();
    const updatedAtMs = new Date(project.updatedAt).getTime();
    expect(updatedAtMs).toBeGreaterThanOrEqual(createdAtMs);
  });

  test("strips full postcode from name/type (keeps outward only)", async ({
    apiClient,
  }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);

    const { project: created } = await createdRes.json();

    const res = await apiClient.put(`/api/projects/${created.id}`, {
      name: "Refurb E4 6JH",
      type: "Bathroom E4 6JH",
    });
    expect(res.status()).toBe(200);

    const { project } = await res.json();
    expect(project.name).toContain("E4");
    expect(project.name).not.toContain("6JH");
    expect(project.type).toContain("E4");
    expect(project.type).not.toContain("6JH");
  });

  test("400 invalid_project_id if id is not a number", async ({
    apiClient,
  }) => {
    const res = await apiClient.put("/api/projects/nope", { name: "x" });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_project_id" });
  });

  test("404 not_found if project does not exist", async ({ apiClient }) => {
    const res = await apiClient.put("/api/projects/999999999", {
      name: "Updated Project Name",
      type: "Kitchen",
      description: "Updated description",
      propertyType: "Flat",
      bedrooms: 2,
    });
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  test("403 forbidden if not owner", async ({
    apiClient,
    request,
    runtime,
  }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);

    const { project: created } = await createdRes.json();

    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      "other_owner_" + Date.now(),
    );

    const res = await otherClient.put(`/api/projects/${created.id}`, {
      description: "Attempted edit by non-owner",
    });

    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  test("400 location_update_not_allowed if trying to change address/location", async ({
    apiClient,
  }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);

    const { project: created } = await createdRes.json();

    const res = await apiClient.put(`/api/projects/${created.id}`, {
      location: "SW1A 1AA",
      name: created.name,
      type: created.type,
      description: created.description,
      propertyType: created.propertyType,
      bedrooms: created.bedrooms,
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({
      error: "location_update_not_allowed",
      message: "Location cannot be updated via this endpoint.",
    });
  });

  test("allows location field if it is the same as stored", async ({
    apiClient,
  }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);

    const { project: created } = await createdRes.json();

    const res = await apiClient.put(`/api/projects/${created.id}`, {
      location: created.location,
      description: "Updated with same location present",
    });

    expect(res.status()).toBe(200);

    const { project } = await res.json();
    expect(project.id).toBe(created.id);
    expect(project.description).toBe("Updated with same location present");
  });

  test("allows location field if it is empty string", async ({ apiClient }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);

    const { project: created } = await createdRes.json();

    const res = await apiClient.put(`/api/projects/${created.id}`, {
      location: "",
      description: "Updated with empty location present",
    });

    expect(res.status()).toBe(200);

    const { project } = await res.json();
    expect(project.id).toBe(created.id);
    expect(project.description).toBe("Updated with empty location present");
  });

  test("400 invalid_payload when validation fails", async ({ apiClient }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);

    const { project: created } = await createdRes.json();

    const res = await apiClient.put(`/api/projects/${created.id}`, {
      name: "A",
      type: created.type,
      description: created.description,
      propertyType: created.propertyType,
      bedrooms: 99,
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
  });

  test("rejects update with description over 500 characters", async ({
    apiClient,
  }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);
    const { project: created } = await createdRes.json();

    const res = await apiClient.put(`/api/projects/${created.id}`, {
      description: "x".repeat(501),
    });
    expect(res.status()).toBe(400);
  });

  test("accepts update with empty description", async ({ apiClient }) => {
    const createdRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(createdRes.status()).toBe(201);
    const { project: created } = await createdRes.json();

    const res = await apiClient.put(`/api/projects/${created.id}`, {
      description: "",
    });
    expect(res.status()).toBe(200);
    const { project } = await res.json();
    expect(project.description).toBe("");
  });

  test("401 if no auth", async ({ request, runtime }) => {
    const res = await request.put(`${runtime.apiBaseUrl}/api/projects/1`, {
      data: {
        name: "Updated Project Name",
        type: "Kitchen",
        description: "Updated description",
        propertyType: "Flat",
        bedrooms: 2,
      },
    });

    expect(res.status()).toBe(401);
  });
});
