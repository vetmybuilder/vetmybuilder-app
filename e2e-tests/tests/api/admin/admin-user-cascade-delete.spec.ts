import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";
import Project from "../../../src/models/Project";

test.describe("Admin user delete — cascade cleanup", () => {
  test("deleting a user removes their projects, notifications, favourites, and reports", async ({
    request,
    runtime,
    adminApi,
  }) => {
    const uid = `cascade-del-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    // Signup
    const signupRes = await client.post("/api/auth/signup", {
      email: `cascade-${Date.now()}@test.com`,
      firstName: "Cascade",
      lastName: "Delete",
      password: "Passw0rd!",
    });
    expect(signupRes.status()).toBe(200);

    // Create a project
    const projectPayload = Project.aProject().withRandomDetails().toApiPayload();
    const createRes = await client.post("/api/projects", projectPayload);
    expect(createRes.status()).toBe(201);
    const { project } = await createRes.json();

    // Create a report
    await client.post("/api/reports", {
      targetType: "profile",
      targetId: "some-profile",
      category: "spam",
    });

    // Delete the user via admin helper
    await adminApi.deleteUser(uid);

    // Verify the project is gone
    await adminApi.expectProjectNotInList(project.id);
  });

  test("admin cannot delete themselves", async ({ adminApiClient }) => {
    const uid = process.env.TEST_ADMIN_USER_UID!;
    const res = await adminApiClient.del(`/api/admin/users/${uid}`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("cannot_delete_self");
  });
});
