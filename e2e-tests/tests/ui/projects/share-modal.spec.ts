import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";

test.describe("Share modal", () => {
  test("channel buttons are selectable in the share modal", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.publish();

    await projectDetailsPage.openShareModal();
    await projectDetailsPage.publishModal.channelWhatsapp.click();
    await projectDetailsPage.publishModal.hasChannelSelected("whatsapp");

    await projectDetailsPage.publishModal.channelSms.click();
    await projectDetailsPage.publishModal.hasChannelSelected("sms");

    await projectDetailsPage.publishModal.close();
  });

  test("neighbourhood toggle is locked after sharing with neighbourhood", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);

    // Publish with neighbourhood sharing enabled (no channel = no OS popup)
    await projectDetailsPage.publish({ askNeighbourhood: true, channel: null });
    await projectDetailsPage.hasStatus("Live");

    // Re-open the share modal on the now-live project
    await projectDetailsPage.openShareModal();
    await projectDetailsPage.publishModal.hasNeighbourhoodLocked();

    await projectDetailsPage.publishModal.close();
  });
});
