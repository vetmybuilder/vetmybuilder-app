// tests/specs/edit-project.spec.ts
import { test, expect } from "../../src/fixtures/base-fixture";
import { ProjectsApi } from "../../src/api-utils/projects-api";
import Project from "../../src/models/Project";

test.describe("Projects - Edit", () => {
  test("can edit a project", async ({
    page,
    usersApi,
    authApi,
    projectViewPage,
    projectsPage,
  }) => {
    const { api: projectsApi } = await ProjectsApi.createForNewOwner({
      usersApi,
      authApi,
      page,
      loginInBrowser: true,
      redirect: "/projects",
    });

    const project = Project.aProject();
    await projectsApi.createProject(project);
    await projectsPage.viewForProjectId(project.id!);

    const newProjectDetails = new Project({
      name: "Basement Conversion",
      type: "Bathroom refit",
      location: "E4",
      propertyType: "Cottage",
      bedrooms: 1,
      description: "New project details",
    });

    await projectViewPage.editProject(newProjectDetails);
    await projectViewPage.hasProjectData(newProjectDetails);
    await projectViewPage.backToMyProjectsButton.click();
    await projectsPage.hasProjects([newProjectDetails]);
  });
});
