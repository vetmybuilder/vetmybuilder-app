import { test } from "../../../src/ui.fixtures";
import { setupTradesmanJobsListScene } from "../../../src/apiHelper/tradesman/setupTradesmanJobsListScene";

test.describe("Tradesman jobs list (/tradesman/jobs/list)", () => {
  test("shows every live job, dimming low-match ones", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanJobsListPage,
  }) => {
    const scene = await setupTradesmanJobsListScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
    });

    await tradesmanJobsListPage.goto();

    await tradesmanJobsListPage.expectRowsVisible([
      scene.highScoreProjectId,
      scene.mediumScoreProjectId,
      scene.lowScoreProjectId,
    ]);
    await tradesmanJobsListPage.expectRowNotDimmed(scene.highScoreProjectId);
    await tradesmanJobsListPage.expectRowDimmed(scene.lowScoreProjectId);
  });

  test("My trades chip narrows the list, All chip restores it", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanJobsListPage,
  }) => {
    const scene = await setupTradesmanJobsListScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
    });

    await tradesmanJobsListPage.goto();

    await tradesmanJobsListPage.tapMyTradesChip();
    await tradesmanJobsListPage.expectRowVisible(scene.highScoreProjectId);
    await tradesmanJobsListPage.expectRowHidden(scene.mediumScoreProjectId);
    await tradesmanJobsListPage.expectRowHidden(scene.lowScoreProjectId);

    await tradesmanJobsListPage.tapAllChip();
    await tradesmanJobsListPage.expectRowsVisible([
      scene.highScoreProjectId,
      scene.mediumScoreProjectId,
      scene.lowScoreProjectId,
    ]);
  });

  test("rows do not expose contact or message buttons", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanJobsListPage,
  }) => {
    await setupTradesmanJobsListScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
    });

    await tradesmanJobsListPage.goto();
    await tradesmanJobsListPage.expectNoContactOrMessageButtons();
  });

  test("Open in deck opens the swipe deck focused on that job", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanJobsListPage,
  }) => {
    const scene = await setupTradesmanJobsListScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
    });

    await tradesmanJobsListPage.goto();
    await tradesmanJobsListPage.tapOpenInDeck(scene.highScoreProjectId);
    await tradesmanJobsListPage.expectFocusedDeckUrl(scene.highScoreProjectId);
  });
});
