// tests/specs/recommendation.spec.ts
import { test } from "../../src/fixtures/base-fixture";
import { ProjectsApi } from "../../src/api-utils/projects-api";
import Project from "../../src/models/Project";
import User from "../../src/models/User";

test.describe("Community projects", () => {
  let project: Project;
  let communityMemberUid!: string;
  const headersWithActions = [
    "Name",
    "Type",
    "Location",
    "Property",
    "Beds",
    "Created",
    "Status",
    "Actions",
  ];

  test.beforeEach(async ({ usersApi, authApi, loginAsUid }) => {
    // Owner creates + publishes
    const { api: ownerApi } = await ProjectsApi.createForNewOwner({
      usersApi,
      authApi,
      loginInBrowser: false,
    });

    project = Project.aProject();
    (project as any).location = "E4";
    await ownerApi.createProject(project);
    (project as any).status = "Live";
    await ownerApi.publish(project);

    // Community user in same area
    const communityMember = User.aUser().withPostcode("E4");
    const created = await usersApi.createUser(communityMember);
    communityMemberUid = created.uid!;

    // Login as community user
    await loginAsUid(communityMemberUid, { redirect: "/projects" });
  });

  test("can add a community project to favorites", async ({ projectsPage }) => {
    // Favourites initially empty
    await projectsPage.tabFavourites.click();
    await projectsPage.hasNoProjects();

    // Community shows the project with Actions
    await projectsPage.tabCommunityProjects.click();
    await projectsPage.hasProjects(
      [project],
      headersWithActions,
      "Add to favourites"
    );

    // Add to favourites via UI and verify it moves
    await projectsPage.addToFavourites(project.id!);
    await projectsPage.hasNoProjects(); // community now empty

    await projectsPage.tabFavourites.click();
    await projectsPage.hasProjects([project], headersWithActions);
  });

  test("can remove a community project from favourites", async ({
    authApi,
    projectsPage,
  }) => {
    // Seed favourites via API for the logged-in community user
    const { api: memberApi } = await ProjectsApi.createForUid({
      uid: communityMemberUid,
      authApi,
    });
    await memberApi.favouriteProject(project.id!);

    // Remove via UI and verify it returns to Community
    await projectsPage.tabFavourites.click();
    await projectsPage.removeFromFavourites(project.id!);
    await projectsPage.hasNoProjects();

    await projectsPage.tabCommunityProjects.click();
    await projectsPage.hasProjects([project], headersWithActions);
  });
});
