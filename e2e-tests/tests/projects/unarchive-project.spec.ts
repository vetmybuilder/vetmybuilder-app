// // tests/specs/projects.spec.ts
// import { test, expect } from "../../src/fixtures/base-fixture";
// import { ProjectsApi } from "../../src/api-utils/projects-api";
// import Project from "../../src/models/Project";

// test.describe("Projects — Unarchive", () => {
//   test("can unarchive a project", async ({
//     page,
//     usersApi,
//     authApi,
//     projectsPage,
//     projectViewPage,
//   }) => {
//     const { api: projectsApi } = await ProjectsApi.createForNewOwner({
//       usersApi,
//       authApi,
//       page,
//       loginInBrowser: true,
//       redirect: "/projects",
//     });

//     const project = Project.aProject();
//     await projectsApi.createProject(project);
//     await projectsPage.viewForProjectId(project.id!);
//     await projectViewPage.archiveBtn.click();
//     await expect(projectViewPage.notificationMessage).toHaveText(
//       "Project archived"
//     );
//     await projectViewPage.unarchiveBtn.click();
//     await expect(projectViewPage.notificationMessage).toHaveText(
//       "Project unarchived"
//     );
//     await expect(projectViewPage.copyInviteLinkBtn).not.toBeVisible();

//     project.status = "Pending";

//     await projectViewPage.hasProjectData(project);
//     await projectViewPage.backToMyProjectsButton.click();
//     await projectsPage.hasProjects([project]);
//   });
// });
