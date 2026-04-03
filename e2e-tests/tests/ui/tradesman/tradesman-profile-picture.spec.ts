import path from "path";
import { test, expect } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";

const PHOTOS = [
  "https://cdn.example.com/work-a.jpg",
  "https://cdn.example.com/work-b.jpg",
  "https://cdn.example.com/work-c.jpg",
];

const FILES_DIR = path.resolve(__dirname, "../../../src/files");

test.describe("Profile picture", () => {
  test("first existing photo is auto-selected; avatar shown on profile page after save", async ({
    apiClient,
    tradesmanEditPage,
    tradesmanMyProfilePage,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS);

    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    await tradesmanEditPage.goto();
    await tradesmanEditPage.goToStep2();
    await tradesmanEditPage.assertProfileBadgeVisible();
    await tradesmanEditPage.goToStep3();
    await tradesmanEditPage.save();

    await tradesmanMyProfilePage.goto();
    await tradesmanMyProfilePage.assertAvatarIsPhoto();
  });

  test("selecting a different photo updates the avatar on the profile page", async ({
    apiClient,
    tradesmanEditPage,
    tradesmanMyProfilePage,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS);

    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    await tradesmanEditPage.goto();
    await tradesmanEditPage.goToStep2();

    // Auto-selected first; now click the second photo
    await tradesmanEditPage.clickExistingPhoto(1);

    // Profile badge should now be on the second photo (there should still be exactly one badge)
    const badges = tradesmanEditPage.step2Form.getByText("Profile", { exact: true });
    await expect(badges).toHaveCount(1);

    await tradesmanEditPage.goToStep3();
    await tradesmanEditPage.save();

    await tradesmanMyProfilePage.goto();
    expect(await tradesmanMyProfilePage.getAvatarSrc()).toBe(PHOTOS[1]);
  });

  test("builder with no photos shows initials avatar", async ({
    apiClient,
    tradesmanMyProfilePage,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();

    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    await tradesmanMyProfilePage.goto();
    await tradesmanMyProfilePage.assertAvatarIsInitials();
  });

  test("uploading photos during registration auto-selects the first as profile picture", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    const uid = `e2e-reg-pp-${Date.now()}`;

    await authHelper.loginAsUid(uid);
    // /tradesman/register-tradesmen is guest-only — log out before navigating
    await authHelper.logout();
    await mockPostcodesIo(page);

    await tradesmanRegisterPage.goto();
    await tradesmanRegisterPage.fillStep1({
      companyName: "E2E Test Builder Ltd",
      contactName: "E2E Builder",
      email: `builder-${uid}@test.com`,
    });
    await tradesmanRegisterPage.addServiceArea("SW1A 1AA");
    await tradesmanRegisterPage.goToStep2();
    await tradesmanRegisterPage.uploadPhotos([
      path.join(FILES_DIR, "photo1.jpg"),
      path.join(FILES_DIR, "photo2.jpg"),
    ]);

    await tradesmanRegisterPage.assertProfileBadgeVisible();
  });

  test("can change profile picture selection during registration", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    const uid = `e2e-reg-pp2-${Date.now()}`;

    await authHelper.loginAsUid(uid);
    // /tradesman/register-tradesmen is guest-only — log out before navigating
    await authHelper.logout();
    await mockPostcodesIo(page);

    await tradesmanRegisterPage.goto();
    await tradesmanRegisterPage.fillStep1({
      companyName: "E2E Changer Ltd",
      contactName: "E2E Builder",
      email: `builder2-${uid}@test.com`,
    });
    await tradesmanRegisterPage.addServiceArea("SW1A 1AA");
    await tradesmanRegisterPage.goToStep2();
    await tradesmanRegisterPage.uploadPhotos([
      path.join(FILES_DIR, "photo1.jpg"),
      path.join(FILES_DIR, "photo2.jpg"),
      path.join(FILES_DIR, "photo3.jpg"),
    ]);

    await tradesmanRegisterPage.assertProfileBadgeVisible();
    await tradesmanRegisterPage.clickUnselectedPhoto();
    await tradesmanRegisterPage.assertProfileBadgeCount(1);
  });
});
