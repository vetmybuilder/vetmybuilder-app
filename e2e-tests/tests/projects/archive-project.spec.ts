// e2e-tests/tests/projects/archive-project.spec.ts
import { test } from "../../src/fixtures/base-fixture";
import Project from "../../src/models/Project";

test.describe("Projects — archive", () => {
  test("can archive a project", async ({
    projectsApi,
    projectsPage,
    projectViewPage,
  }) => {
    const project = Project.aProject();

    await projectsApi.createProject(project);
    await projectsApi.publish(project);
    await projectsPage.filterByNameAndWait(project.name);
    await projectsPage.openProjectByName(project.name);
    await projectViewPage.archiveBtn.click();
    await projectViewPage.hasNotificationMessage("Project archived");

    project.status = "Archived";
    
    await projectViewPage.hasProjectData(project);
    await projectViewPage.backToMyProjectsButton.click();
    await projectsPage.hasNoProjects();
  });
});
