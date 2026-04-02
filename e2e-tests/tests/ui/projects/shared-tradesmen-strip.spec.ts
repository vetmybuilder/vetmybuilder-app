import { test, expect } from "../../../src/ui.fixtures";
import { authedApiForUid } from "../../../src/api/services/client";
import Project from "../../../src/models/Project";
import Tradesman from "../../../src/models/tradesman";
import SharesApi from "../../../src/apiHelper/tradesman/SharesApi";

test.describe("Shared tradesmen strip", () => {
  test("strip shows tradesman photo when profile picture is set", async ({
    request,
    projectApi,
    projectDetailsPage,
    runtime,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const tradesmanUid = `strip-photo-${Date.now()}`;
    const tradesmanClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      tradesmanUid,
    );

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(["https://cdn.example.com/avatar.jpg"])
      .withProfilePictureUrl("https://cdn.example.com/avatar.jpg");

    await tradesmanClient.put("/api/tradesmen/me", tradesman.toPayload());

    const sharesApi = new SharesApi(tradesmanClient);
    await sharesApi.shareProfile(created.id);

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasSharedTradesmenStrip();
    await projectDetailsPage.sharedTradesmanHasPhoto();
  });

  test("strip shows initials when tradesman has no profile picture", async ({
    request,
    projectApi,
    projectDetailsPage,
    runtime,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const tradesmanUid = `strip-initials-${Date.now()}`;
    const tradesmanClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      tradesmanUid,
    );

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName("Budget Build Co");

    await tradesmanClient.put("/api/tradesmen/me", tradesman.toPayload());

    const sharesApi = new SharesApi(tradesmanClient);
    await sharesApi.shareProfile(created.id);

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasSharedTradesmenStrip();
    await projectDetailsPage.sharedTradesmanHasInitials("BB");
  });

  test("clicking a strip card navigates to the tradesman profile page", async ({
    request,
    projectApi,
    projectDetailsPage,
    runtime,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const tradesmanUid = `strip-nav-${Date.now()}`;
    const tradesmanClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      tradesmanUid,
    );

    const tradesman = Tradesman.aTradesman().withRandomDetails();
    await tradesmanClient.put("/api/tradesmen/me", tradesman.toPayload());

    const sharesApi = new SharesApi(tradesmanClient);
    await sharesApi.shareProfile(created.id);

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasSharedTradesmenStrip();
    await projectDetailsPage.clickSharedTradesmanCard();

    await expect(projectDetailsPage.page).toHaveURL(
      new RegExp(`/tradesman/${tradesmanUid}`),
      { timeout: 15_000 },
    );
  });
});
