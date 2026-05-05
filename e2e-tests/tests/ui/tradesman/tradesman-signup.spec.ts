import path from "path";
import { test, expect } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";
import { mockBoroughsApi } from "../../../src/helpers/BoroughsApiMock";

const FILES_DIR = path.resolve(__dirname, "../../../src/files");

const STRONG_PASSWORD_ERROR =
  "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.";

test.describe("Tradesman signup", () => {
  test.describe("Email/password registration — Step 1 (company + service area)", () => {
    test.beforeEach(async ({ page, authHelper, tradesmanRegisterPage }) => {
      await authHelper.ensureGuest();
      await mockPostcodesIo(page);
      await tradesmanRegisterPage.goto();
    });

    test("empty required fields produce per-field errors and no top banner", async ({
      tradesmanRegisterPage,
    }) => {
      await tradesmanRegisterPage.tryContinueFromStep1();

      await tradesmanRegisterPage.expectFieldError(
        "companyName",
        /Company name is required/,
      );
      await tradesmanRegisterPage.expectFieldError(
        "contactName",
        /Contact name is required/,
      );
      await tradesmanRegisterPage.expectFieldError(
        "email",
        /Business email is required/,
      );
      await tradesmanRegisterPage.expectFieldError(
        "serviceAreas",
        /Add at least one service area/,
      );
      await tradesmanRegisterPage.expectNoTopBanner();
    });

    test("invalid UK phone produces a phone-field error and a valid one clears it", async ({
      tradesmanRegisterPage,
    }) => {
      await tradesmanRegisterPage.fillStep1({
        companyName: "Test Co",
        contactName: "Chris Test",
        email: "chris.test@example.com",
      });
      await tradesmanRegisterPage.addServiceArea("E4 6AB");

      await tradesmanRegisterPage.fillPhone("09043535345322342342");
      await tradesmanRegisterPage.tryContinueFromStep1();
      await tradesmanRegisterPage.expectFieldError(
        "phone",
        /Enter a valid UK phone number/,
      );

      await tradesmanRegisterPage.fillPhone("07123 456789");
      await tradesmanRegisterPage.expectFieldErrorCleared(
        /Enter a valid UK phone number/,
      );
    });
  });

  test.describe("Email/password registration — Step 1 (borough service area)", () => {
    test.beforeEach(async ({ page, authHelper, tradesmanRegisterPage }) => {
      await authHelper.ensureGuest();
      await mockPostcodesIo(page);
      await mockBoroughsApi(page);
      await tradesmanRegisterPage.goto();
    });

    test("selecting a borough adds a single chip and lists covered postcodes", async ({
      tradesmanRegisterPage,
    }) => {
      await tradesmanRegisterPage.selectBoroughByName(
        "waltham",
        "Waltham Forest",
      );
      await tradesmanRegisterPage.expectServicePreview(
        "Covers: E4, E10, E11, E17",
      );
    });

    test("selecting a borough absorbs an overlapping outward already added", async ({
      tradesmanRegisterPage,
    }) => {
      await tradesmanRegisterPage.addServiceArea("E4 6AB");
      await tradesmanRegisterPage.expectChipVisible("E4");

      await tradesmanRegisterPage.selectBoroughByName(
        "waltham",
        "Waltham Forest",
      );

      await tradesmanRegisterPage.expectChipRemoved("E4");
      await tradesmanRegisterPage.expectChipVisible("Waltham Forest");
      await tradesmanRegisterPage.expectServicePreview(
        "Covers: E4, E10, E11, E17",
      );
    });

    test("borough search is not called for outward-code queries", async ({
      page,
      authHelper,
      tradesmanRegisterPage,
    }) => {
      await authHelper.ensureGuest();
      await mockPostcodesIo(page);
      const boroughMock = await mockBoroughsApi(page);

      await tradesmanRegisterPage.goto();
      await tradesmanRegisterPage.fillServiceAreaQuery("E4");

      await boroughMock.expectNotCalled();
    });
  });

  test.describe("Email/password registration — Step 2 (photos)", () => {
    test.describe.configure({ timeout: 180_000 });

    test.beforeEach(async ({ page, authHelper }) => {
      await authHelper.ensureGuest();
      await mockPostcodesIo(page);
    });

    test("uploading photos auto-selects the first as the profile picture", async ({
      tradesmanRegisterPage,
    }) => {
      await tradesmanRegisterPage.goto();
      await tradesmanRegisterPage.fillStep1({
        companyName: "E2E Test Builder Ltd",
        contactName: "E2E Builder",
        email: `builder-${Date.now()}@test.com`,
      });
      await tradesmanRegisterPage.addServiceArea("SW1A 1AA");
      await tradesmanRegisterPage.goToStep2();
      await tradesmanRegisterPage.uploadPhotos([
        path.join(FILES_DIR, "photo1.jpg"),
        path.join(FILES_DIR, "photo2.jpg"),
      ]);

      await tradesmanRegisterPage.assertProfileBadgeVisible();
    });

    test("the homeowner can change which photo is the profile picture", async ({
      tradesmanRegisterPage,
    }) => {
      await tradesmanRegisterPage.goto();
      await tradesmanRegisterPage.fillStep1({
        companyName: "E2E Changer Ltd",
        contactName: "E2E Builder",
        email: `builder2-${Date.now()}@test.com`,
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

  test.describe("Email/password registration — Step 4 (account)", () => {
    test.describe.configure({ timeout: 180_000 });

    test.beforeEach(async ({ page, authHelper }) => {
      await authHelper.ensureGuest();
      await mockPostcodesIo(page);
    });

    test("registers with a strong password and lands on the tradesman jobs deck", async ({
      tradesmanRegisterPage,
    }) => {
      const tradesman = Tradesman.aTradesman().withRandomRegistration();
      await tradesmanRegisterPage.walkToAccountStep(tradesman);

      await tradesmanRegisterPage.fillStep4Password(tradesman.requiredPassword);
      await tradesmanRegisterPage.fillStep4ConfirmPassword(
        tradesman.requiredPassword,
      );
      await tradesmanRegisterPage.submitStep4();
      await tradesmanRegisterPage.expectLandedOnTradesmanJobs();
    });

    test("rejects a weak password with the strong-password error", async ({
      tradesmanRegisterPage,
    }) => {
      const tradesman = Tradesman.aTradesman().withRandomRegistration({
        password: "abc",
      });
      await tradesmanRegisterPage.walkToAccountStep(tradesman);

      await tradesmanRegisterPage.fillStep4Password(tradesman.requiredPassword);
      await tradesmanRegisterPage.fillStep4ConfirmPassword(
        tradesman.requiredPassword,
      );
      await tradesmanRegisterPage.submitStep4();

      await expect(tradesmanRegisterPage.createAccountError).toContainText(
        STRONG_PASSWORD_ERROR,
      );
      await expect(tradesmanRegisterPage.step4).toBeVisible();
    });

    test("rejects a mismatched confirm password", async ({
      tradesmanRegisterPage,
    }) => {
      const tradesman = Tradesman.aTradesman().withRandomRegistration();
      await tradesmanRegisterPage.walkToAccountStep(tradesman);

      await tradesmanRegisterPage.fillStep4Password(tradesman.requiredPassword);
      await tradesmanRegisterPage.fillStep4ConfirmPassword("DifferentPw1!");
      await tradesmanRegisterPage.submitStep4();

      await expect(tradesmanRegisterPage.createAccountError).toContainText(
        "Passwords do not match.",
      );
      await expect(tradesmanRegisterPage.step4).toBeVisible();
    });

    test("password checklist appears once typing starts and rules turn green progressively", async ({
      tradesmanRegisterPage,
    }) => {
      const tradesman = Tradesman.aTradesman().withRandomRegistration();
      await tradesmanRegisterPage.walkToAccountStep(tradesman);

      await expect(tradesmanRegisterPage.passwordChecklist).toBeHidden();

      await tradesmanRegisterPage.fillStep4Password("a");
      await expect(tradesmanRegisterPage.passwordChecklist).toBeVisible();
      await tradesmanRegisterPage.assertChecklistRule(
        "One lowercase letter (a–z)",
        true,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "At least 8 characters",
        false,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "One uppercase letter (A–Z)",
        false,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "One number (0–9)",
        false,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "One special character (!@#…)",
        false,
      );

      await tradesmanRegisterPage.fillStep4Password("Abcdefgh");
      await tradesmanRegisterPage.assertChecklistRule(
        "At least 8 characters",
        true,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "One uppercase letter (A–Z)",
        true,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "One number (0–9)",
        false,
      );

      await tradesmanRegisterPage.fillStep4Password("Abcdefg1");
      await tradesmanRegisterPage.assertChecklistRule(
        "One number (0–9)",
        true,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "One special character (!@#…)",
        false,
      );

      await tradesmanRegisterPage.fillStep4Password("Abcdefg1!");
      await tradesmanRegisterPage.assertChecklistRule(
        "One special character (!@#…)",
        true,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "At least 8 characters",
        true,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "One uppercase letter (A–Z)",
        true,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "One lowercase letter (a–z)",
        true,
      );
      await tradesmanRegisterPage.assertChecklistRule(
        "One number (0–9)",
        true,
      );
    });
  });

  test.describe("SSO signup-complete (post-OAuth interstitial)", () => {
    test.beforeEach(
      async ({ page, authHelper, tradesmanSignupCompletePage }) => {
        await authHelper.logout();
        await authHelper.loginAsUidWithoutProfile();
        await mockPostcodesIo(page);
        await tradesmanSignupCompletePage.goto();
        await tradesmanSignupCompletePage.expectVisible();
      },
    );

    test("empty required fields produce per-field errors", async ({
      tradesmanSignupCompletePage,
    }) => {
      await tradesmanSignupCompletePage.tryContinueFromStep1();

      await tradesmanSignupCompletePage.expectFieldError(
        "companyName",
        /Company name is required/,
      );
      await tradesmanSignupCompletePage.expectFieldError(
        "contactName",
        /Contact name is required/,
      );
      await tradesmanSignupCompletePage.expectFieldError(
        "serviceAreas",
        /Add at least one service area/,
      );
    });

    test("invalid UK phone produces a phone-field error and a valid one clears it", async ({
      tradesmanSignupCompletePage,
    }) => {
      await tradesmanSignupCompletePage.fillStep1({
        companyName: "SSO Trades Co",
        contactName: "SSO Contact",
      });
      await tradesmanSignupCompletePage.addServiceArea("SW1A 1AA");

      await tradesmanSignupCompletePage.fillPhone(
        "073534534535345355432534",
      );
      await tradesmanSignupCompletePage.tryContinueFromStep1();
      await tradesmanSignupCompletePage.expectFieldError(
        "phone",
        /Enter a valid UK phone number/,
      );

      await tradesmanSignupCompletePage.fillPhone("07123 456789");
      await tradesmanSignupCompletePage.expectFieldErrorCleared(
        /Enter a valid UK phone number/,
      );
    });
  });
});
