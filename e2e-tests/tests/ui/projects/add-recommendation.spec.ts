import ProjectApi from "../../../src/apiHelper/project/ProjectApi";
import { setupOwnerWithLiveProject } from "../../../src/apiHelper/project/setupOwnerWithLiveProject";
import { createHomeownerAccount } from "../../../src/apiHelper/account/createHomeownerAccount";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Account from "../../../src/models/Account";
import { test, expect } from "../../../src/ui.fixtures";

test.describe("Add recommendation", () => {
  test("Logged in user can add a recommendation", async ({
    request,
    runtime,
    loginPage,
    projectDetailsPage,
    projectRecommendPage,
  }) => {
    const location = "E4";

    // 1. API: create the recommender account
    const recommender = await createHomeownerAccount({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
      emailPrefix: "recommender",
    });

    // 2. API: create the project owner account
    const owner = await createHomeownerAccount({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
      emailPrefix: "owner",
    });

    // 3. API: owner creates a project
    const ownerProjectApi = new ProjectApi(owner.client);
    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });
    const created = await ownerProjectApi.createProject(project.toApiPayload());

    const recommendation = Recommendation.aRecommendation()
      .withRandomDetails()
      .withCompanyEmail(`hello+${Date.now()}@elegantbuilding.test`);

    // 4. UI: recommender logs in and visits the recommend page directly
    await loginPage.loginExpectSuccess(
      recommender.account.email!,
      recommender.account.password!,
    );
    await projectRecommendPage.visit(created.id);

    // 5. UI: fill the recommendation (asserts the auto-filled identity
    //    fields once they're on screen - Step 2 on mobile)
    await projectRecommendPage.fillRecommendationForLoggedInUser(
      recommender.account,
      recommendation,
    );

    // 6. UI: submit and wait for the success state
    await projectRecommendPage.submitButton.click();
    await projectRecommendPage.waitForSubmissionSuccess();

    // 7. UI: owner logs in
    await loginPage.loginExpectSuccess(owner.account.email!, owner.account.password!);

    // 8. UI: owner visits the project and sees the new recommendation
    await projectDetailsPage.assertProjectShowsRecommendation(
      created.id,
      recommendation,
    );
  });

  test("Guests can add a recommendation", async ({
    request,
    runtime,
    loginPage,
    projectDetailsPage,
    projectRecommendPage,
  }) => {
    const location = "E4";

    // 1. API: create the project owner account
    const owner = await createHomeownerAccount({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
      emailPrefix: "owner",
    });

    // 2. API: owner creates a project
    const ownerProjectApi = new ProjectApi(owner.client);
    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });
    const created = await ownerProjectApi.createProject(project.toApiPayload());

    const guestRecommender = Account.aGuestAccount();
    const recommendation = Recommendation.aRecommendation();

    // 3. UI: guest visits the recommend page directly (no login)
    await projectDetailsPage.logoutViaUrl();
    await projectRecommendPage.visit(created.id);

    // 4. UI: guest fills + submits the recommendation. The helper waits
    //    for the success view and the post-submit redirect to '/'.
    await projectRecommendPage.submitRecommendationForGuestUser(
      guestRecommender,
      recommendation,
      created.id,
    );

    // 5. UI: owner logs in
    await loginPage.loginExpectSuccess(
      owner.account.email!,
      owner.account.password!,
    );

    // 6. UI: owner visits the project and sees the new recommendation
    await projectDetailsPage.assertProjectShowsRecommendation(
      created.id,
      recommendation,
    );
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

    // Comment lives on Step 1 (mobile). Fill it before advancing.
    await projectRecommendPage.commentInput.fill(
      "This is a perfectly valid comment over ten characters.",
    );

    // Advance to Step 2 (no-op on desktop). goToStep2 sets quality:5
    // automatically so the Continue button enables on mobile.
    await projectRecommendPage.goToStep2();

    const guest = Account.aGuestAccount();
    await projectRecommendPage.nameInput.fill(
      `${guest.firstName} ${guest.lastName}`.trim(),
    );
    await projectRecommendPage.companyInput.fill("Some Company Ltd");
    await projectRecommendPage.companyEmailInput.fill("not-an-email");

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

    await projectRecommendPage.commentInput.fill(
      "This is a perfectly valid comment over ten characters.",
    );

    await projectRecommendPage.goToStep2();

    const guest = Account.aGuestAccount();
    await projectRecommendPage.nameInput.fill(
      `${guest.firstName} ${guest.lastName}`.trim(),
    );
    await projectRecommendPage.emailInput.fill("nope-not-email");
    await projectRecommendPage.companyInput.fill("Some Company Ltd");

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

    // On mobile the submit button only appears on Step 2. goToStep2
    // taps a star to satisfy the Continue gate, then advances. On
    // desktop this is a no-op and submit is reachable immediately.
    await projectRecommendPage.goToStep2();

    await projectRecommendPage.submitForm();

    await projectRecommendPage.assertFieldError(
      "name",
      "Please enter your name.",
    );
  });

  test("mobile only: Continue is disabled until at least one star rating is set", async ({
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

    test.skip(
      !projectRecommendPage.isMobile(),
      "wizard step gating is mobile-only",
    );

    await expect(projectRecommendPage.continueButton).toBeVisible();
    await expect(projectRecommendPage.continueButton).toBeDisabled();

    await projectRecommendPage.starButton("quality", 5).click();

    await expect(projectRecommendPage.continueButton).toBeEnabled();
  });
});
