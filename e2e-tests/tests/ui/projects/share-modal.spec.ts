import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";

test.describe("Share modal", () => {
  test("channel buttons are selectable in the share modal", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    // Projects now create as live — open the share modal directly
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);

    await projectDetailsPage.openShareModal();
    await projectDetailsPage.publishModal.channelWhatsapp.click();
    await projectDetailsPage.publishModal.hasChannelSelected("whatsapp");

    await projectDetailsPage.publishModal.channelSms.click();
    await projectDetailsPage.publishModal.hasChannelSelected("sms");

    await projectDetailsPage.publishModal.close();
  });

  // Neighbourhood toggle was removed from the share modal — test no longer applies.
  test.skip("neighbourhood toggle is locked after sharing with neighbourhood", async () => {
    // This test was invalidated when the neighbourhood toggle was removed from
    // the share modal UI. Remove this skip once the feature is re-introduced.
  });
});
