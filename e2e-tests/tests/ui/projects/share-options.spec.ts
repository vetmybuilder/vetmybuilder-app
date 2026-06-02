import { setupSharableProjectScene } from "../../../src/apiHelper/project/setupSharableProjectScene";
import { test } from "../../../src/ui.fixtures";

test.describe("Share a job to socials", () => {
  test("owner sees the Nextdoor and Facebook share tiles", async ({
    request,
    runtime,
    adminApi,
    loginPage,
    projectDetailsPage,
  }) => {
    const { owner, projectId } = await setupSharableProjectScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      adminApi,
      location: "E4",
    });

    await loginPage.loginExpectSuccess(owner.email!, owner.password!);
    await projectDetailsPage.visit(projectId);
    await projectDetailsPage.expectSocialShareTilesVisible(projectId);
  });
});
