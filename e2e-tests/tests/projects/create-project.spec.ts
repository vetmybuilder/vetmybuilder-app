// tests/specs/projects.spec.ts
import { test, expect } from "../../src/fixtures/base-fixture";
import Project from "../../src/models/Project";

test.describe("Projects", () => {
  test.beforeEach(async ({ loginAsNewUser }) => {
    await loginAsNewUser({ redirect: "/" });
  });

  test("can create a project and project should be in pending state when not published", async ({
    homePage,
    createProjectPage,
    projectViewPage,
    projectsPage,
  }) => {
    const project = Project.aProject();

    await homePage.goto();
    await homePage.getStartedLink.click();
    await createProjectPage.createProject(project);
    await expect(projectViewPage.copyInviteLinkBtn).not.toBeVisible();
    await projectViewPage.hasProjectData(project);
    await projectViewPage.backToMyProjectsButton.click();
    await projectsPage.hasProjects([project]);
  });
});
