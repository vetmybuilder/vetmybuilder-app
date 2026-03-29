import Project from "../../../src/models/Project";
import Account from "../../../src/models/Account";
import { test, expect } from "../../../src/ui.fixtures";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

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

  test("neighbour can view a published project in their area", async ({
    request,
    runtime,
    projectApi,
    loginPage,
    projectDetailsPage,
  }) => {
    const location = "E4";
    const password = "Passw0rd!";

    const project = Project.aProject()
      .withRandomDetails()
      .withLocation(location);

    const created = await projectApi.createProject(project.toApiPayload());

    const neighbour = Account.anAccount()
      .withRandomDetails()
      .withLocation(location)
      .withEmail(`neighbour+${Date.now()}@test.com`)
      .withPassword(password);

    const neighbourAuthUser = await createAuthUser(
      neighbour.email!,
      neighbour.password!,
    );

    const neighbourClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      neighbourAuthUser.uid,
    );

    await AuthApi.signup(neighbourClient, neighbour);

    await loginPage.loginExpectSuccess(neighbour.email!, neighbour.password!);
    await projectApi.publishProject(created.id);
    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasHomeownerProjectDetails(created.id, project);
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
