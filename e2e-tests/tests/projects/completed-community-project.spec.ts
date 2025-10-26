// e2e-tests/tests/recommendation.spec.ts
import { test, expect } from "../../src/fixtures/base-fixture";
import Project from "../../src/models/Project";

test.describe("Completed Community projects", () => {
  test("community user in same area should NOT see archived project", async ({
    page,
    loginAsNewUser,
    projectsApi,
    projectsPage,
  }) => {
    // Owner (auto-logged-in) creates & publishes
    const project = Project.aProject().withPostcode("E4");
    await projectsApi.createProject(project);
    await projectsApi.publish(project);

    // Close as 'did not go ahead' (becomes ARCHIVED)
    await projectsApi.close(project, {
      didGoAhead: false,
      reasons: ["budget"],
      waitForStatus: "archived",
    });

    // Login as a different user in the same area
    await loginAsNewUser({ postcode: project.location, redirect: "/projects" });
    await projectsPage.expectLoaded();

    // Completed Community Projects should NOT include archived projects
    await projectsPage.tabCompletedCommunityProjects.click();
    await expect(
      page.getByRole("link", { name: project.name, exact: true })
    ).toHaveCount(0);
  });
});

// // tests/specs/recommendation.spec.ts
// import { test } from "../../src/fixtures/base-fixture";
// import { ProjectsApi } from "../../src/api-utils/projects-api";
// import Project from "../../src/models/Project";
// import User from "../../src/models/User";

// test.describe("Completed Community projects", () => {
//   let project: Project;
//   let communityMemberUid!: string;
//   const headersWithActions = [
//     "Type",
//     "Location",
//     "Date Closed",
//     "Tradesman",
//     "Gallery",
//   ];

//   test.beforeEach(async ({ usersApi, authApi, loginAsUid }) => {
//     // Owner creates + publishes
//     const { api: ownerApi } = await ProjectsApi.createForNewOwner({
//       usersApi,
//       authApi,
//       loginInBrowser: false,
//     });

//     project = Project.aProject();
//     (project as any).location = "E4";
//     await ownerApi.createProject(project);
//     (project as any).status = "Live";
//     await ownerApi.publish(project);

//     // Community user in same area
//     const communityMember = User.aUser().withPostcode("E4");
//     const created = await usersApi.createUser(communityMember);
//     communityMemberUid = created.uid!;

//     // Login as community user
//     await loginAsUid(communityMemberUid, { redirect: "/projects" });
//   });

//   test("Can see projects in the same location", async ({
//     authApi,
//     projectsPage,
//   }) => {
//     // Seed favourites via API for the logged-in community user
//     const { api: memberApi } = await ProjectsApi.createForUid({
//       uid: communityMemberUid,
//       authApi,
//     });
//     await memberApi.favouriteProject(project.id!);

//     // Remove via UI and verify it returns to Community
//     await projectsPage.tabFavourites.click();
//     await projectsPage.removeFromFavourites(project.id!);
//     await projectsPage.hasNoProjects();

//     await projectsPage.tabCommunityProjects.click();
//     await projectsPage.hasProjects([project], headersWithActions);
//   });
// });
