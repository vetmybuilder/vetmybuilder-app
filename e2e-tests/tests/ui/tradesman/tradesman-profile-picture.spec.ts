import path from "path";
import { test, expect } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import TradesmanMyProfilePage from "../../../src/pages/TradesmanMyProfilePage";
import TradesmanEditPage from "../../../src/pages/TradesmanEditPage";
import TradesmanRegisterPage from "../../../src/pages/TradesmanRegisterPage";
import { loginInAsTradesman } from "../../../src/apiHelper/tradesman/setupTradesmanSession";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";

const PHOTOS = [
  "https://cdn.example.com/work-a.jpg",
  "https://cdn.example.com/work-b.jpg",
  "https://cdn.example.com/work-c.jpg",
];

const FILES_DIR = path.resolve(__dirname, "../../../src/files");

test.describe("Profile picture — edit flow", () => {
  test("first existing photo is auto-selected; avatar shown on profile page after save", async ({
    request,
    page,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS);

    await loginInAsTradesman({
      request,
      page,
      apiBaseUrl: runtime.apiBaseUrl,
      uiBaseUrl: runtime.webBaseUrl,
      tradesman,
    });

    const editPage = new TradesmanEditPage(page);
    const profilePage = new TradesmanMyProfilePage(page);

    await editPage.goto();
    await editPage.goToStep2();
    await editPage.assertProfileBadgeVisible();
    await editPage.goToStep3();
    await editPage.save();

    await profilePage.goto();
    await profilePage.assertAvatarIsPhoto();
  });

  test("selecting a different photo updates the avatar on the profile page", async ({
    request,
    page,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS);

    await loginInAsTradesman({
      request,
      page,
      apiBaseUrl: runtime.apiBaseUrl,
      uiBaseUrl: runtime.webBaseUrl,
      tradesman,
    });

    const editPage = new TradesmanEditPage(page);
    const profilePage = new TradesmanMyProfilePage(page);

    await editPage.goto();
    await editPage.goToStep2();

    // Auto-selected first; now click the second photo
    await editPage.clickExistingPhoto(1);

    // Profile badge should now be on the second photo (there should still be exactly one badge)
    const badges = editPage.step2Form.getByText("Profile", { exact: true });
    await expect(badges).toHaveCount(1);

    await editPage.goToStep3();
    await editPage.save();

    // Avatar should be the second photo URL
    await profilePage.goto();
    const src = await profilePage.getAvatarSrc();
    expect(src).toBe(PHOTOS[1]);
  });

  test("builder with no photos shows initials avatar", async ({
    request,
    page,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();

    await loginInAsTradesman({
      request,
      page,
      apiBaseUrl: runtime.apiBaseUrl,
      uiBaseUrl: runtime.webBaseUrl,
      tradesman,
    });

    const profilePage = new TradesmanMyProfilePage(page);
    await profilePage.goto();
    await profilePage.assertAvatarIsInitials();
  });
});

test.describe("Profile picture — registration flow (step 2 UI)", () => {
  test("uploading photos auto-selects the first as profile picture", async ({
    page,
    authHelper,
  }) => {
    const uid = `e2e-reg-pp-${Date.now()}`;

    await authHelper.loginAsUid(uid);
    await mockPostcodesIo(page);

    const registerPage = new TradesmanRegisterPage(page);
    await registerPage.goto();
    await registerPage.fillStep1({
      companyName: "E2E Test Builder Ltd",
      contactName: "E2E Builder",
      email: `builder-${uid}@test.com`,
    });
    await registerPage.addServiceArea("SW1A 1AA");
    await registerPage.goToStep2();
    await registerPage.uploadPhotos([
      path.join(FILES_DIR, "photo1.jpg"),
      path.join(FILES_DIR, "photo2.jpg"),
    ]);

    await registerPage.assertProfileBadgeVisible();
  });

  test("can change profile picture selection in step 2", async ({
    page,
    authHelper,
  }) => {
    const uid = `e2e-reg-pp2-${Date.now()}`;

    await authHelper.loginAsUid(uid);
    await mockPostcodesIo(page);

    const registerPage = new TradesmanRegisterPage(page);
    await registerPage.goto();
    await registerPage.fillStep1({
      companyName: "E2E Changer Ltd",
      contactName: "E2E Builder",
      email: `builder2-${uid}@test.com`,
    });
    await registerPage.addServiceArea("SW1A 1AA");
    await registerPage.goToStep2();
    await registerPage.uploadPhotos([
      path.join(FILES_DIR, "photo1.jpg"),
      path.join(FILES_DIR, "photo2.jpg"),
      path.join(FILES_DIR, "photo3.jpg"),
    ]);

    await registerPage.assertProfileBadgeVisible();
    await registerPage.clickUnselectedPhoto();
    await registerPage.assertProfileBadgeCount(1);
  });
});
