// e2e-tests/tests/ui/tradesman/tradesman-register-account.spec.ts
//
// Covers Step 4 of the tradesman-registration wizard:
//   - Successful end-to-end registration with a strong password
//   - Strong-password client-side validation rejects weak passwords
//   - Password checklist surfaces and updates as the user types
//   - Confirm-password mismatch is rejected
//
// All tests walk Steps 1 → 3 with the minimum data needed to reach Step 4
// (a trade type is required on Step 2 so the wizard considers the profile
// fillable; nothing on Step 3 is mandatory).

import { test, expect } from "../../../src/ui.fixtures";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";

const STRONG_PASSWORD = "Passw0rd!";
const STRONG_PASSWORD_ERROR =
  "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.";
const TRADE_LABEL = "General Builder";

/**
 * Drive the wizard from a fresh /tradesman/register-tradesmen state through
 * Steps 1 → 4 with deterministic test inputs. Returns the email used so the
 * test can also use it for the post-registration login or to assert.
 */
async function walkToStep4(opts: {
  page: import("@playwright/test").Page;
  authHelper: any;
  tradesmanRegisterPage: any;
  uniqueTag: string;
}) {
  const { page, authHelper, tradesmanRegisterPage, uniqueTag } = opts;

  // /tradesman/register-tradesmen is guest-only. Force a clean guest state
  // by logging in as a throwaway uid and then immediately logging out — this
  // mirrors the pattern used by tradesman-profile-picture.spec.ts and is more
  // reliable than a bare logout when a previous test left Firebase auth state.
  await authHelper.loginAsUid(`reg-cleanup-${uniqueTag}`);
  await authHelper.logout();
  await mockPostcodesIo(page);

  await tradesmanRegisterPage.goto();

  await tradesmanRegisterPage.fillStep1({
    companyName: `E2E Reg Builder ${uniqueTag} Ltd`,
    contactName: "E2E Reg Builder",
    email: `e2e-reg-${uniqueTag}@test.com`,
  });
  await tradesmanRegisterPage.addServiceArea("SW1A 1AA");
  await tradesmanRegisterPage.goToStep2();

  await tradesmanRegisterPage.selectTradeType(TRADE_LABEL);
  await tradesmanRegisterPage.goToStep3();

  await tradesmanRegisterPage.goToStep4();

  return { email: `e2e-reg-${uniqueTag}@test.com` };
}

test.describe("Tradesman registration — Step 4 (account)", () => {
  test("successfully registers with a strong password and lands on the projects page", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    const tag = `ok-${Date.now()}`;
    await walkToStep4({ page, authHelper, tradesmanRegisterPage, uniqueTag: tag });

    await tradesmanRegisterPage.fillStep4Password(STRONG_PASSWORD);
    await tradesmanRegisterPage.fillStep4ConfirmPassword(STRONG_PASSWORD);
    await tradesmanRegisterPage.submitStep4();

    await page.waitForURL(/\/tradesman\/projects/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/tradesman\/projects/);
  });

  test("rejects a weak password with the strong-password error", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    const tag = `weak-${Date.now()}`;
    await walkToStep4({ page, authHelper, tradesmanRegisterPage, uniqueTag: tag });

    await tradesmanRegisterPage.fillStep4Password("abc");
    await tradesmanRegisterPage.fillStep4ConfirmPassword("abc");
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
    const tag = `chk-${Date.now()}`;
    await walkToStep4({ page, authHelper, tradesmanRegisterPage, uniqueTag: tag });

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
    const tag = `mismatch-${Date.now()}`;
    await walkToStep4({ page, authHelper, tradesmanRegisterPage, uniqueTag: tag });

    await tradesmanRegisterPage.fillStep4Password(STRONG_PASSWORD);
    await tradesmanRegisterPage.fillStep4ConfirmPassword("DifferentPw1!");
    await tradesmanRegisterPage.submitStep4();

    await expect(tradesmanRegisterPage.createAccountError).toContainText(
      "Passwords do not match.",
    );
    await expect(tradesmanRegisterPage.step4).toBeVisible();
  });
});
