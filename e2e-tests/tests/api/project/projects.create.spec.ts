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

    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();

    // Server strips full postcodes inside name/type/location
    expect(body.project.name).toBe(stripFullUkPostcodes(payload.name));
    expect(body.project.type).toBe(stripFullUkPostcodes(payload.type));

    // API stores outward code only (your model already has this)
    expect(body.project.location).toBe(project.locationQuery);

    expect(body.project.status).toBe("pending");
  });
});
