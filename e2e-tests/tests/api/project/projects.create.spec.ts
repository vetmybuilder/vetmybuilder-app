import Project from "../../../src/models/Project";
import { test, expect } from "../../../src/fixtures";
import { stripFullUkPostcodes } from "../../../src/utils/formatters";

test.describe("POST /api/projects", () => {
  test("creates a project for the authenticated user", async ({
    apiClient,
  }) => {
    const project = Project.aProject().withRandomDetails();

    const payload = project.toApiPayload();
    const res = await apiClient.post("/api/projects", payload);

    expect(res.status()).toBe(201);

    const body = await res.json();
    const created = body.project;

    expect(created).toBeTruthy();
    expect(created.id).toBeTruthy();

    // Server strips full postcodes inside name/type/location
    expect(created.name).toBe(stripFullUkPostcodes(payload.name));
    expect(created.type).toBe(stripFullUkPostcodes(payload.type));

    // API stores outward code only
    expect(created.location).toBe(project.locationQuery);

    expect(created.status).toBe("live");

    expect(created.createdAt).toBeTruthy();

    // updatedAt should NOT indicate an update on creation
    expect(
      created.updatedAt === null ||
        created.updatedAt === undefined ||
        created.updatedAt === created.createdAt,
    ).toBe(true);
  });

  test("rejects a project with description over 500 characters", async ({
    apiClient,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const payload = project.toApiPayload();
    payload.description = "x".repeat(501);

    const res = await apiClient.post("/api/projects", payload);
    expect(res.status()).toBe(400);
  });

  test("accepts a project with an empty description", async ({
    apiClient,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const payload = project.toApiPayload();
    payload.description = "";

    const res = await apiClient.post("/api/projects", payload);
    expect(res.status()).toBe(201);
  });
});
