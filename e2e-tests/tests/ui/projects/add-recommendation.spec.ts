import ProjectApi from "../../../src/apiHelper/project/ProjectApi";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Account from "../../../src/models/Account";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";
import { test, expect } from "../../../src/ui.fixtures";

test.describe("Add recommendation", () => {
  test("Logged in user can add a recommendation", async ({
    request,
    runtime,
    loginPage,
    projectDetailsPage,
    projectRecommendPage,
    builderProfilePage,
  }) => {
    const location = "E4";
    const password = "Passw0rd!";

    const owner = Account.anAccount()
      .withRandomDetails()
      .withLocation(location)
      .withEmail(`owner+${Date.now()}@test.com`)
      .withPassword(password);

    const ownerAuthUser = await createAuthUser(owner.email!, owner.password!);

    const ownerClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      ownerAuthUser.uid,
    );

    await AuthApi.signup(ownerClient, owner);

    const ownerProjectApi = new ProjectApi(ownerClient);

    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });

    const created = await ownerProjectApi.createProject(project.toApiPayload());

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
    await ownerProjectApi.publishProject(created.id);
    await projectDetailsPage.logout();
    await loginPage.loginExpectSuccess(neighbour.email!, neighbour.password!);

    const notificationText = `A new project “${project.workTypes[0]} in ${location} (${project.propertyType})” in your area is now live`;

    await projectDetailsPage.hasNotification(notificationText);
    await projectDetailsPage.openNotification(notificationText);
    await projectDetailsPage.hasHomeownerProjectDetails(created.id, project);

    const recommendation = Recommendation.aRecommendation();

    await projectDetailsPage.recommendTradespersonButton.click();
    await projectRecommendPage.submitRecommendationForLoggedInUser(
      neighbour,
      recommendation,
      created.id,
    );
    await projectDetailsPage.waitUntilReady();
    await projectDetailsPage.logout();
    await loginPage.loginExpectSuccess(owner.email!, owner.password!);
    await projectDetailsPage.visit(created.id);

    const newNotificationText = `Someone has recommended a tradesperson to your project “${project.workTypes[0]} in ${location} (${project.propertyType})”`;

    await projectDetailsPage.hasNotification(newNotificationText);
    await expect(projectDetailsPage.page).toHaveURL(`/projects/${created.id}`);
    await projectDetailsPage.hasProjectRecommendation(recommendation);
    await projectDetailsPage.openProjectRecommendation(recommendation);
    await builderProfilePage.hasBuilderRecommendationDetails(recommendation);
  });

  test("Guests can add a recommendation", async ({
    request,
    runtime,
    loginPage,
    projectDetailsPage,
    projectRecommendPage,
    builderProfilePage,
  }) => {
    const location = "E4";
    const password = "Passw0rd!";

    const owner = Account.anAccount()
      .withRandomDetails()
      .withLocation(location)
      .withEmail(`owner+${Date.now()}@test.com`)
      .withPassword(password);

    const ownerAuthUser = await createAuthUser(owner.email!, owner.password!);

    const ownerClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      ownerAuthUser.uid,
    );

    await AuthApi.signup(ownerClient, owner);

    const ownerProjectApi = new ProjectApi(ownerClient);

    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });

    const created = await ownerProjectApi.createProject(project.toApiPayload());

    await ownerProjectApi.publishProject(created.id);

    const guestRecommender = Account.aGuestAccount();
    const recommendation = Recommendation.aRecommendation();

    await projectDetailsPage.logout();
    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasHomeownerProjectDetails(created.id, project);

    await projectDetailsPage.recommendTradespersonButton.click();
    await projectRecommendPage.submitRecommendationForGuestUser(
      guestRecommender,
      recommendation,
      created.id,
    );

    // After guest submission the page redirects to '/'. No waitUntilReady here.
    await loginPage.loginExpectSuccess(owner.email!, owner.password!);
    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasNotification(`Someone has recommended a tradesperson to your project “${project.workTypes[0]} in ${location} (${project.propertyType})”`);
    await expect(projectDetailsPage.page).toHaveURL(`/projects/${created.id}`);
    await projectDetailsPage.hasProjectRecommendation(recommendation);
    await projectDetailsPage.openProjectRecommendation(recommendation);
    await builderProfilePage.hasBuilderRecommendationDetails(recommendation);
  });
});
