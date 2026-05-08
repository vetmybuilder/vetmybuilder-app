import { test } from "../../../src/ui.fixtures";
import { setupTradesmanJobsListScene } from "../../../src/apiHelper/tradesman/setupTradesmanJobsListScene";

test.describe("Tradesman jobs list (/tradesman/jobs/list)", () => {
  test("renders every live job, dims low-score rows, and keeps high-score rows clean", async ({
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

  test("My trades chip filters to only the rows whose type matches the tradesman's trades, and All restores everything", async ({
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
    await tradesmanJobsListPage.expectRowVisible(scene.highScoreProjectId);

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

  test("does not surface contact or message buttons before a match", async ({
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

  test("Open in deck routes to /tradesman/jobs?focus=<id>", async ({
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
