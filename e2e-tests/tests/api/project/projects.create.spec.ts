import Project from "../../../src/models/project";
import { test, expect } from "../../../src/fixtures";

test.describe("POST /api/projects", () => {
  test("creates a project for the authenticated user", async ({
    apiClient,
  }) => {
    const project = Project.aProject().withRandomDetails();

    const res = await apiClient.post("/api/projects", project.toPayload());
    expect(res.status()).toBe(201);

    const body = await res.json();

    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();
    expect(body.project.name).toBe(project.name);
    expect(body.project.status).toBe("pending");
  });
});
