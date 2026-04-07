// e2e-tests/tests/ui/tradesman/tradesman-register-account.spec.ts
//
// Covers Step 4 of the tradesman-registration wizard:
//   - Successful end-to-end registration with a strong password
//   - Strong-password client-side validation rejects weak passwords
//   - Password checklist surfaces and updates as the user types
//   - Confirm-password mismatch is rejected
//
// Each test starts from a fresh guest state, walks Steps 1 → 3 via the page
// object's walkToAccountStep helper, and then asserts behaviour on Step 4.

import { test, expect } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";

const STRONG_PASSWORD_ERROR =
  "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.";

test.describe("Tradesman registration — Step 4 (account)", () => {
  test("successfully registers with a strong password and lands on the projects page", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomRegistration();

    await authHelper.ensureGuest();
    await mockPostcodesIo(page);
    await tradesmanRegisterPage.walkToAccountStep(tradesman);

    await tradesmanRegisterPage.fillStep4Password(tradesman.requiredPassword);
    await tradesmanRegisterPage.fillStep4ConfirmPassword(
      tradesman.requiredPassword,
    );
    await tradesmanRegisterPage.submitStep4();

    await page.waitForURL(/\/tradesman\/projects/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/tradesman\/projects/);
  });

  test("rejects a weak password with the strong-password error", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomRegistration({
      password: "abc",
    });

    await authHelper.ensureGuest();
    await mockPostcodesIo(page);
    await tradesmanRegisterPage.walkToAccountStep(tradesman);

    await tradesmanRegisterPage.fillStep4Password(tradesman.requiredPassword);
    await tradesmanRegisterPage.fillStep4ConfirmPassword(
      tradesman.requiredPassword,
    );
    await tradesmanRegisterPage.submitStep4();

    await expect(tradesmanRegisterPage.createAccountError).toContainText(
      STRONG_PASSWORD_ERROR,
    );
    // We must still be on Step 4 — registration was blocked client-side
    await expect(tradesmanRegisterPage.step4).toBeVisible();
  });

  test("password checklist appears once typing starts and rules turn green progressively", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomRegistration();

    await authHelper.ensureGuest();
    await mockPostcodesIo(page);
    await tradesmanRegisterPage.walkToAccountStep(tradesman);

    // Empty → checklist hidden (renders nothing when password is empty)
    await expect(tradesmanRegisterPage.passwordChecklist).toBeHidden();

    // Lowercase only → only the lowercase rule passes
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
    await tradesmanRegisterPage.assertChecklistRule("One number (0–9)", false);
    await tradesmanRegisterPage.assertChecklistRule(
      "One special character (!@#…)",
      false,
    );

    // Add 8+ chars and uppercase
    await tradesmanRegisterPage.fillStep4Password("Abcdefgh");
    await tradesmanRegisterPage.assertChecklistRule(
      "At least 8 characters",
      true,
    );
    await tradesmanRegisterPage.assertChecklistRule(
      "One uppercase letter (A–Z)",
      true,
    );
    await tradesmanRegisterPage.assertChecklistRule("One number (0–9)", false);

    // Add a digit
    await tradesmanRegisterPage.fillStep4Password("Abcdefg1");
    await tradesmanRegisterPage.assertChecklistRule("One number (0–9)", true);
    await tradesmanRegisterPage.assertChecklistRule(
      "One special character (!@#…)",
      false,
    );

    // Add a symbol — now ALL rules pass
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
    await tradesmanRegisterPage.assertChecklistRule("One number (0–9)", true);
  });

  test("rejects a mismatched confirm password", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomRegistration();

    await authHelper.ensureGuest();
    await mockPostcodesIo(page);
    await tradesmanRegisterPage.walkToAccountStep(tradesman);

    await tradesmanRegisterPage.fillStep4Password(tradesman.requiredPassword);
    await tradesmanRegisterPage.fillStep4ConfirmPassword("DifferentPw1!");
    await tradesmanRegisterPage.submitStep4();

    await expect(tradesmanRegisterPage.createAccountError).toContainText(
      "Passwords do not match.",
    );
    await expect(tradesmanRegisterPage.step4).toBeVisible();
  });
});
