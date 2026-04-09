import { test, expect } from "../../../src/ui.fixtures";
import {
  createHomeownerUser,
  generatePasswordResetCode,
} from "../../../src/helpers/FirebaseSeed";
import { getPasswordResetCode } from "../../../src/helpers/EmulatorHelper";
import Account from "../../../src/models/Account";

test.describe("Forgot password", () => {
  let testEmail: string;

  test.beforeEach(async ({ page, runtime }) => {
    const account = Account.anAccount()
      .withRandomDetails()
      .withEmail(`reset+${Date.now()}@test.com`)
      .withStrongPassword();

    testEmail = account.requiredEmail;

    // Create a complete homeowner so they can sign in and land cleanly on
    // /projects after the password reset (not /signup/complete).
    await createHomeownerUser(page.request, runtime.apiBaseUrl, {
      email: testEmail,
      password: account.requiredPassword,
      firstName: account.firstName,
      lastName: account.lastName,
      location: account.location,
    });
  });

  test("user can request a password reset link, set a strong new password, and sign in successfully", async ({
    forgotPasswordPage,
    resetPasswordPage,
    loginPage,
    homeownerProjectsPage,
    basePage,
  }) => {
    // 1. Submit forgot password form
    await forgotPasswordPage.goto();
    await forgotPasswordPage.submitEmail(testEmail);
    await forgotPasswordPage.expectSuccess();

    // 2. Grab oobCode from the Firebase Auth Emulator logs
    const oobCode = await getPasswordResetCode(testEmail);

    // 3. Navigate to the reset page with the code
    await resetPasswordPage.gotoWithCode(oobCode);

    // 4. Set the new strong password
    await resetPasswordPage.setPassword(Account.STRONG_PASSWORD);
    await resetPasswordPage.submit();
    await resetPasswordPage.expectSuccess();

    // 5. Sign in with the new password
    await basePage.logoutViaUrl();
    await loginPage.loginExpectSuccess(testEmail, Account.STRONG_PASSWORD);
    await homeownerProjectsPage.expectVisible();
  });

  test("shows success screen even for an unknown email", async ({
    forgotPasswordPage,
  }) => {
    await forgotPasswordPage.goto();
    await forgotPasswordPage.submitEmail(`nonexistent+${Date.now()}@test.com`);
    await forgotPasswordPage.expectSuccess();
  });

  test("submit button is disabled until all password rules pass", async ({
    resetPasswordPage,
  }) => {
    const oobCode = await generatePasswordResetCode(testEmail);
    await resetPasswordPage.gotoWithCode(oobCode);

    // No input — button must be disabled
    await resetPasswordPage.expectSubmitDisabled();

    // Each weak password — button stays disabled
    await resetPasswordPage.rejectWeakPasswords();

    // Strong password — button becomes enabled
    await resetPasswordPage.setPassword(Account.STRONG_PASSWORD);
    await expect(resetPasswordPage.submitButton).toBeEnabled();
  });

  test("submit button is disabled when passwords do not match", async ({
    resetPasswordPage,
  }) => {
    const oobCode = await generatePasswordResetCode(testEmail);
    await resetPasswordPage.gotoWithCode(oobCode);

    await resetPasswordPage.newPasswordInput.fill(Account.STRONG_PASSWORD);
    await resetPasswordPage.confirmPasswordInput.fill("Different1!XYZ");
    await resetPasswordPage.expectSubmitDisabled();
  });

  test("shows error screen for an invalid oobCode", async ({
    resetPasswordPage,
  }) => {
    await resetPasswordPage.gotoWithCode("totally-invalid-code");
    await expect(
      resetPasswordPage.page.getByText("Link expired"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("forgot password link is visible on the login page", async ({
    loginPage,
  }) => {
    await loginPage.goto();
    const link = loginPage.page.getByRole("link", { name: "Forgot password?" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/forgot-password");
  });

  test("logged-in user visiting /forgot-password is redirected away", async ({
    loginPage,
    forgotPasswordPage,
    homeownerProjectsPage,
  }) => {
    // Sign in first
    await loginPage.loginExpectSuccess(testEmail, Account.STRONG_PASSWORD);

    // Navigate to forgot-password while authenticated
    await forgotPasswordPage.page.goto("/forgot-password");

    // Should be redirected — the forgot-password card should never appear
    await expect(forgotPasswordPage.card).not.toBeVisible({ timeout: 8_000 });

    // Should land on the projects dashboard
    await homeownerProjectsPage.expectVisible();
  });
});
