import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";

test.describe("GET /api/notifications?grouped=1", () => {
  test("grouped response has correct shape", async ({
    notificationsApi,
  }) => {
    const result = await notificationsApi.listGrouped();
    expect(Array.isArray(result.groups)).toBe(true);
    expect(Array.isArray(result.ungrouped)).toBe(true);
    expect(typeof result.unread).toBe("number");
  });

  test("closed project notifications are excluded from grouped view", async ({
    projectApi,
    notificationsApi,
  }) => {
    const p = Project.aProject().withRandomDetails({
      category: "Plumbing",
      workTypes: ["Bathroom Plumbing"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
    });
    const created = await projectApi.createProject(p.toApiPayload(), { publish: true });

    // Close the project
    await projectApi.closeProject(created.id, { didGoAhead: false });

    const { groups } = await notificationsApi.listGrouped();
    const closedGroup = groups.find((g: any) => g.projectId === created.id);
    expect(closedGroup, "Closed project should not appear in grouped view").toBeFalsy();
  });

  test("non-grouped mode still works", async ({
    notificationsApi,
  }) => {
    const { items, unread } = await notificationsApi.list();
    expect(Array.isArray(items)).toBe(true);
    expect(typeof unread).toBe("number");
  });
});
