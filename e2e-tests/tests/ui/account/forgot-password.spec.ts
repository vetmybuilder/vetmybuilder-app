import { test, expect } from "../../../src/ui.fixtures";
import {
  createAuthUser,
  generatePasswordResetCode,
} from "../../../src/helpers/FirebaseSeed";
import { getPasswordResetCode } from "../../../src/helpers/EmulatorHelper";
import Account from "../../../src/models/Account";

test.describe("Forgot password", () => {
  let testEmail: string;

  test.beforeEach(async () => {
    const account = Account.anAccount()
      .withRandomDetails()
      .withEmail(`reset+${Date.now()}@test.com`)
      .withStrongPassword();

    testEmail = account.requiredEmail;
    await createAuthUser(testEmail, account.requiredPassword);
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
    await homeownerProjectsPage.waitUntilReady();
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
});
