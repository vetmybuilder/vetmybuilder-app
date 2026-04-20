import ProjectApi from "../../../src/apiHelper/project/ProjectApi";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";
import { setupOwnerWithLiveProject } from "../../../src/apiHelper/project/setupOwnerWithLiveProject";
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
    // No explicit publishProject call needed — projects are created live

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
    await projectDetailsPage.logoutViaUrl();
    await loginPage.loginExpectSuccess(neighbour.email!, neighbour.password!);

    const notificationText = `A new project “${project.workTypes[0]} in ${location} (${project.propertyType})” in your area is now live`;

    await projectDetailsPage.hasNotification(notificationText);
    await projectDetailsPage.openNotification(notificationText);
    await projectDetailsPage.hasHomeownerProjectDetails(created.id, project);

    const companyEmail = `hello+${Date.now()}@elegantbuilding.test`;
    const recommendation = Recommendation.aRecommendation().withCompanyEmail(
      companyEmail,
    );

    await projectDetailsPage.recommendTradespersonButton.click();
    await projectRecommendPage.submitRecommendationForLoggedInUser(
      neighbour,
      recommendation,
    );
    await projectDetailsPage.waitUntilReady();
    await projectDetailsPage.logoutViaUrl();
    await loginPage.loginExpectSuccess(owner.email!, owner.password!);
    await projectDetailsPage.visit(created.id);

    // Owner should see the companyEmail exposed via the API for the hire flow.
    const recItem = await ownerClient.findProjectRecommendationByCompany(
      created.id,
      recommendation.company,
    );
    expect(recItem).toBeTruthy();
    expect(recItem.companyEmail).toBe(companyEmail);

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
    // No explicit publishProject call needed — projects are created live

    const guestRecommender = Account.aGuestAccount();
    const recommendation = Recommendation.aRecommendation();

    await projectDetailsPage.logoutViaUrl();
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

  test("shows inline error when companyEmail is invalid", async ({
    request,
    runtime,
    projectRecommendPage,
    projectDetailsPage,
  }) => {
    const { projectId } = await setupOwnerWithLiveProject({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });
    await projectDetailsPage.logoutViaUrl();
    await projectRecommendPage.visit(projectId);

    const guest = Account.aGuestAccount();
    await projectRecommendPage.nameInput.fill(
      `${guest.firstName} ${guest.lastName}`.trim(),
    );
    await projectRecommendPage.companyInput.fill("Some Company Ltd");
    await projectRecommendPage.companyEmailInput.fill("not-an-email");
    await projectRecommendPage.commentInput.fill(
      "This is a perfectly valid comment over ten characters.",
    );

    await projectRecommendPage.submitForm();

    await projectRecommendPage.assertFieldError(
      "companyEmail",
      "Please enter a valid email address.",
    );
  });

  test("shows inline error when recommender email is invalid", async ({
    request,
    runtime,
    projectRecommendPage,
    projectDetailsPage,
  }) => {
    const { projectId } = await setupOwnerWithLiveProject({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });
    await projectDetailsPage.logoutViaUrl();
    await projectRecommendPage.visit(projectId);

    const guest = Account.aGuestAccount();
    await projectRecommendPage.nameInput.fill(
      `${guest.firstName} ${guest.lastName}`.trim(),
    );
    await projectRecommendPage.emailInput.fill("nope-not-email");
    await projectRecommendPage.companyInput.fill("Some Company Ltd");
    await projectRecommendPage.commentInput.fill(
      "This is a perfectly valid comment over ten characters.",
    );

    await projectRecommendPage.submitForm();

    await projectRecommendPage.assertFieldError(
      "email",
      "Please enter a valid email address.",
    );
  });

  test("shows inline errors for empty required fields on submit", async ({
    request,
    runtime,
    projectRecommendPage,
    projectDetailsPage,
  }) => {
    const { projectId } = await setupOwnerWithLiveProject({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });
    await projectDetailsPage.logoutViaUrl();
    await projectRecommendPage.visit(projectId);

    await projectRecommendPage.submitForm();

    await projectRecommendPage.assertFieldError(
      "name",
      "Please enter your name.",
    );
  });
});
