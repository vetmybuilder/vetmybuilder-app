import { test, expect } from "../../../src/ui.fixtures";
import { setupGatedJobScene } from "../../../src/apiHelper/payments/setupGatedJobScene";

test.describe("Tradesman pay-gate on /tradesman/jobs", () => {
  test("liking a paid job and buying a pass clears the gate", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanJobsDeckPage,
    swipePayGatePage,
  }) => {
    const scene = await setupGatedJobScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
    });

    await tradesmanJobsDeckPage.goto();
    await tradesmanJobsDeckPage.expectTopCardShowing(scene.projectTitle);

    await tradesmanJobsDeckPage.tapLike();
    await swipePayGatePage.expectVisibleFor(scene.projectTitle);

    await swipePayGatePage.paySubscription("month_1");
    await swipePayGatePage.expectClosed();
  });

  test("liking again after buying a pass completes the swipe without the gate", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    swipeMatchingApi,
    tradesmanJobsDeckPage,
    swipePayGatePage,
  }) => {
    const scene = await setupGatedJobScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
    });

    await tradesmanJobsDeckPage.goto();
    await tradesmanJobsDeckPage.tapLike();
    await swipePayGatePage.paySubscription("month_1");
    await swipePayGatePage.expectClosed();

    await tradesmanJobsDeckPage.tapLike();
    await swipePayGatePage.expectClosed();
    await swipeMatchingApi.waitForSwipeInterest({
      projectId: scene.projectId,
      builderUid: scene.tradesmanUid,
      expectedStatus: "pending",
    });
  });

  test("tapping back closes the pay-gate without paying", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanJobsDeckPage,
    swipePayGatePage,
  }) => {
    const scene = await setupGatedJobScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
    });

    await tradesmanJobsDeckPage.goto();
    await tradesmanJobsDeckPage.tapLike();
    await swipePayGatePage.expectVisibleFor(scene.projectTitle);

    await swipePayGatePage.tapBack();
    await swipePayGatePage.expectClosed();
    await tradesmanJobsDeckPage.expectTopCardShowing(scene.projectTitle);
  });

  test("liking a paid job and paying one-off lands on the unlock-sent page", async ({
    page,
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanJobsDeckPage,
    swipePayGatePage,
  }) => {
    const scene = await setupGatedJobScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
    });

    await tradesmanJobsDeckPage.goto();
    await tradesmanJobsDeckPage.expectTopCardShowing(scene.projectTitle);

    await tradesmanJobsDeckPage.tapLike();
    await swipePayGatePage.expectVisibleFor(scene.projectTitle);

    await swipePayGatePage.payOneOff();
    await swipePayGatePage.expectActivatedFor("£9.99");

    await expect(page).toHaveURL(/\/tradesman\/unlock\/sent/, {
      timeout: 15_000,
    });
    // Page renders both a mobile and desktop variant with the same
    // testid; filter to the visible one for the active viewport.
    await expect(
      page.getByTestId("tradesman-unlock-sent").filter({ visible: true }),
    ).toBeVisible();
  });

  test("pay buttons stay disabled until the tradesperson accepts immediate delivery and waives the 14-day cancellation right", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanJobsDeckPage,
    swipePayGatePage,
  }) => {
    const scene = await setupGatedJobScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
    });

    await tradesmanJobsDeckPage.goto();
    await tradesmanJobsDeckPage.expectTopCardShowing(scene.projectTitle);
    await tradesmanJobsDeckPage.tapLike();

    await swipePayGatePage.expectVisibleFor(scene.projectTitle);
    await swipePayGatePage.expectPayButtonsDisabledUntilWaiver();
  });

  test("liking a recommended job skips the pay-gate", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    swipeMatchingApi,
    tradesmanJobsDeckPage,
    swipePayGatePage,
  }) => {
    const scene = await setupGatedJobScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
      recommendVia: swipeMatchingApi,
    });

    await tradesmanJobsDeckPage.goto();
    await tradesmanJobsDeckPage.expectTopCardShowing(scene.projectTitle);

    await tradesmanJobsDeckPage.tapLike();

    await swipePayGatePage.expectClosed();
    await swipeMatchingApi.waitForSwipeInterest({
      projectId: scene.projectId,
      builderUid: scene.tradesmanUid,
      expectedStatus: "pending",
    });
  });

});
