// // tests/specs/publish-project.spec.ts
// import { test, expect } from "../../src/fixtures/base-fixture";
// import { ProjectsApi } from "../../src/api-utils/projects-api";
// import Project from "../../src/models/Project";

// test.describe("Projects - Publish", () => {
//   test("can publish a project to live", async ({
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
//     await expect(projectViewPage.copyInviteLinkBtn).not.toBeVisible();
//     await projectViewPage.publishBtn.click();
//     await expect(projectViewPage.copyInviteLinkBtn).toBeVisible();

//     project.status = "Live";

//     await projectViewPage.backToMyProjectsButton.click();
//     await projectsPage.hasProjects([project]);
//   });
// });
