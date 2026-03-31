import path from "path";
import { test, expect } from "../../../src/ui.fixtures";
import { authedApiForUid } from "../../../src/api/services/client";
import { uiLoginAsUid } from "../../../src/apiHelper/uiAuth";
import Tradesman from "../../../src/models/tradesman";
import TradesmanMyProfilePage from "../../../src/pages/TradesmanMyProfilePage";
import TradesmanEditPage from "../../../src/pages/TradesmanEditPage";

const PHOTOS = [
  "https://cdn.example.com/work-a.jpg",
  "https://cdn.example.com/work-b.jpg",
  "https://cdn.example.com/work-c.jpg",
];

const FILES_DIR = path.resolve(__dirname, "../../../src/files");

// Mock the postcodes.io external API so LocationField works without network dependency
// TODO: this doesnt not follow test design. i dont put functions in the spec
async function mockPostcodesIo(page: any) {
  await page.route(/api\.postcodes\.io/, async (route: any) => {
    const url: string = route.request().url();
    if (url.includes("/autocomplete")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: 200, result: [] }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: 200,
        result: {
          postcode: "SW1A 1AA",
          outcode: "SW1A",
          outward_code: "SW1A",
          incode: "1AA",
          inward_code: "1AA",
          admin_district: "Westminster",
          region: "London",
          country: "England",
          latitude: 51.5014,
          longitude: -0.1419,
        },
      }),
    });
  });
}

// Helper: seed a tradesman via API and log the browser in as that uid
async function setupTradesman(
  request: any,
  page: any,
  runtime: any,
  tradesman: Tradesman
): Promise<string> {
  const uid = `e2e-pp-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

  const res = await client.put("/api/tradesmen/me", tradesman.toPayload());
  expect(res.status()).toBe(200);

  await uiLoginAsUid({
    request,
    page,
    apiBaseUrl: runtime.apiBaseUrl,
    uiBaseUrl: runtime.webBaseUrl,
    uid,
  });

  // Navigate to the edit page and wait for it to be ready — this confirms the
  // Firebase auth state is fully established before the test proceeds.
  // Without this, mobile webkit sometimes fails to load the protected edit page
  // on the first navigation after uiLoginAsUid → about:blank.
  await page.goto(`${runtime.webBaseUrl}/tradesman/profile/edit`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .waitForSelector('[data-testid="trades-edit-profile-page"]', {
      timeout: 20_000,
    })
    .catch(() => {});

  return uid;
}

test.describe("Profile picture — edit flow", () => {
  test("first existing photo is auto-selected; avatar shown on profile page after save", async ({
    request,
    page,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS);

    await setupTradesman(request, page, runtime, tradesman);

    const editPage = new TradesmanEditPage(page);
    const profilePage = new TradesmanMyProfilePage(page);

    await editPage.goto();
    await editPage.goToStep2();

    // First photo should be auto-selected with the "Profile" badge
    await editPage.assertProfileBadgeVisible();

    // Advance to step 3 and save
    await editPage.goToStep3();
    await editPage.save();

    // Profile page should show an avatar image, not initials
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

    await setupTradesman(request, page, runtime, tradesman);

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
    // No photo URLs seeded

    await setupTradesman(request, page, runtime, tradesman);

    const profilePage = new TradesmanMyProfilePage(page);
    await profilePage.goto();
    await profilePage.assertAvatarIsInitials();
  });

});

test.describe("Profile picture — registration flow (step 2 UI)", () => {
  test("uploading photos auto-selects the first as profile picture", async ({
    page,
    runtime,
    authHelper,
  }) => {
    const uid = `e2e-reg-pp-${Date.now()}`;

    await authHelper.loginAsUid(uid);
    await mockPostcodesIo(page);

    await page.goto("/tradesman/register-tradesmen", {
      waitUntil: "domcontentloaded",
    });

    // Step 1 — fill company details
    await expect(page.getByTestId("step-1")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("input-company-name").fill("E2E Test Builder Ltd");
    await page.getByTestId("input-contact-name").fill("E2E Builder");
    await page.getByTestId("input-email").fill(`builder-${uid}@test.com`);

    // Add a service area — use a full postcode so LocationField resolves without network
    const areaInput = page
      .getByTestId("input-areas")
      .locator("input")
      .first();
    await areaInput.fill("SW1A 1AA");
    await areaInput.press("Enter");
    // Wait for the outward-code chip to appear before advancing
    await expect(
      page.locator('[aria-label="Remove SW1A"]')
    ).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("btn-next").click();

    // Step 2 — upload photos
    await expect(page.getByTestId("step-2")).toBeVisible({ timeout: 15_000 });

    const fileInput = page.getByTestId("file-input");
    await fileInput.setInputFiles([
      path.join(FILES_DIR, "photo1.jpg"),
      path.join(FILES_DIR, "photo2.jpg"),
    ]);

    // First uploaded photo should be auto-selected (Profile badge visible)
    await expect(
      page.getByText("Profile", { exact: true }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("can change profile picture selection in step 2", async ({
    page,
    runtime,
    authHelper,
  }) => {
    const uid = `e2e-reg-pp2-${Date.now()}`;

    await authHelper.loginAsUid(uid);
    await mockPostcodesIo(page);

    await page.goto("/tradesman/register-tradesmen", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("step-1")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("input-company-name").fill("E2E Changer Ltd");
    await page.getByTestId("input-contact-name").fill("E2E Builder");
    await page.getByTestId("input-email").fill(`builder2-${uid}@test.com`);

    const areaInput = page
      .getByTestId("input-areas")
      .locator("input")
      .first();
    await areaInput.fill("SW1A 1AA");
    await areaInput.press("Enter");
    await expect(
      page.locator('[aria-label="Remove SW1A"]')
    ).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("btn-next").click();

    await expect(page.getByTestId("step-2")).toBeVisible({ timeout: 15_000 });

    const fileInput = page.getByTestId("file-input");
    await fileInput.setInputFiles([
      path.join(FILES_DIR, "photo1.jpg"),
      path.join(FILES_DIR, "photo2.jpg"),
      path.join(FILES_DIR, "photo3.jpg"),
    ]);

    // First photo auto-selected
    await expect(
      page.getByText("Profile", { exact: true }).first()
    ).toBeVisible({ timeout: 5_000 });

    // Click an unselected photo to change selection
    const selectionButtons = page.getByRole("button", {
      name: /set as profile picture/i,
    });
    await selectionButtons.first().click();

    // Still exactly one "Profile" badge
    await expect(page.getByText("Profile", { exact: true })).toHaveCount(1);
  });
});
