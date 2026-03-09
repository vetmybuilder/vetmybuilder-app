import Project from "../../../src/models/Project";
import Account from "../../../src/models/Account";
import { test, expect } from "../../../src/ui.fixtures";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("Project publish journey", () => {
  test("can publish a project", async ({
    projectApi,
    projectDetailsPage,
    homeownerProjectsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasStatus("Pending");

    await projectDetailsPage.publish();
    await projectDetailsPage.hasStatus("Live");

    await projectDetailsPage.goBack();
    await homeownerProjectsPage.hasStatus(created.id, "LIVE");
  });

  test.skip("neighbour can view project if in same location", async ({
    request,
    runtime,
    projectApi,
    loginPage,
    projectDetailsPage,
    homeownerProjectsPage,
  }) => {
    const location = "E4";
    const password = "Passw0rd!";

    const project = Project.aProject()
      .withRandomDetails()
      .withLocation(location);

    const created = await projectApi.createProject(project.toApiPayload());
    await projectApi.publishProject(created.id);

    const neighbour = Account.anAccount()
      .withRandomDetails()
      .withLocation(location)
      .withEmail(`neighbour+${Date.now()}@test.com`)
      .withPassword(password);

    const neighbourUid = `neighbour-${Date.now()}`;

    await createAuthUser(neighbour.email!, neighbour.password!);

    const neighbourClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      neighbourUid,
    );

    await neighbourClient.post("/api/auth/signup", {
      firstName: neighbour.firstName,
      lastName: neighbour.lastName,
      username: neighbour.username,
      location: neighbour.location,
    });

    await loginPage.goto();
    await loginPage.login(neighbour.email!, neighbour.password!);

    await homeownerProjectsPage.goto();
    await homeownerProjectsPage.page.pause();
    // await homeownerProjectsPage.openProject(created.id);

    // await projectDetailsPage.hasStatus("Live");
  });

  // test("neighbour cannot view project if in different location", async ({
  //   accountApi,
  //   projectApi,
  //   loginPage,
  //   projectsPage,
  //   page,
  // }) => {
  //   // Owner in E4
  //   const owner = Account.anAccount().withRandomDetails().withLocation("E4");
  //   await accountApi.createAccount(owner.toApiPayload());

  //   const project = Project.aProject()
  //     .withRandomDetails()
  //     .withLocation("E4");

  //   const created = await projectApi.createProject(project.toApiPayload());
  //   await projectApi.publishProject(created.id);

  //   // Neighbour in different location
  //   const neighbour = Account.anAccount()
  //     .withRandomDetails()
  //     .withLocation("SW1");

  //   await accountApi.createAccount(neighbour.toApiPayload());

  //   await loginPage.login(neighbour);

  //   await projectsPage.goto();

  //   // Project should not appear
  //   await expect(
  //     projectsPage.projectCard(created.id)
  //   ).not.toBeVisible();
  // });
});
