import { setupOwnerWithLiveProject } from "../../../src/apiHelper/project/setupOwnerWithLiveProject";
import { test } from "../../../src/ui.fixtures";

test.describe("Share a job to socials", () => {
  // The Nextdoor + Facebook tiles are gated behind the social_share_buttons
  // feature flag (default off), so by default only the always-on channels
  // show. The on-state (anchors + correct hrefs) is covered by the
  // SocialShareButtons component unit test.
  test("owner sees the core channels; Nextdoor/Facebook gated off by default", async ({
    request,
    runtime,
    loginPage,
    projectDetailsPage,
  }) => {
    const { owner, projectId } = await setupOwnerWithLiveProject({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location: "E4",
    });

    await loginPage.loginExpectSuccess(owner.email!, owner.password!);
    await projectDetailsPage.visit(projectId);

    await projectDetailsPage.expectCoreShareChannels();
    await projectDetailsPage.expectSocialShareHidden();
  });
});
