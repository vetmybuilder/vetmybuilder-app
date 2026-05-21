// e2e-tests/tests/ui/tradesman/tradesman-signup.spec.ts

import { test, expect } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";

const STRONG_PASSWORD = "ProTrade!8AB";
const WEAK_PASSWORD = "abc";

test.describe("Tradesman signup (lean entry page)", () => {
  test.beforeEach(async ({ authHelper, tradesmanRegisterPage }) => {
    await authHelper.ensureGuest();
    await tradesmanRegisterPage.goto();
  });

  test("renders Google CTA + email form + 'Already a member?' link", async ({
    tradesmanRegisterPage,
  }) => {
    await tradesmanRegisterPage.expectLandingVisible();
    await tradesmanRegisterPage.expectGoogleButtonVisible();
    await tradesmanRegisterPage.expectEmailFormVisible();
    await tradesmanRegisterPage.expectSignInLink();
  });

  test("'Already a member? Sign in' link points at /login with the trader next-route", async ({
    tradesmanRegisterPage,
  }) => {
    await tradesmanRegisterPage.expectSignInHref(
      "/login?next=/tradesman/jobs",
    );
  });

  test("weak password is rejected and the checklist shows live feedback", async ({
    tradesmanRegisterPage,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomRegistration();
    await tradesmanRegisterPage.fillEmail(tradesman.email ?? "");
    await tradesmanRegisterPage.fillPassword(WEAK_PASSWORD);
    await tradesmanRegisterPage.fillConfirmPassword(WEAK_PASSWORD);
    await tradesmanRegisterPage.expectPasswordChecklistVisible();
    await tradesmanRegisterPage.submitEmailSignup();
    await tradesmanRegisterPage.expectPasswordError(
      /at least 8 characters/i,
    );
  });

  test("mismatched passwords block submit", async ({
    tradesmanRegisterPage,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomRegistration();
    await tradesmanRegisterPage.fillEmail(tradesman.email ?? "");
    await tradesmanRegisterPage.fillPassword(STRONG_PASSWORD);
    await tradesmanRegisterPage.fillConfirmPassword(STRONG_PASSWORD + "x");
    await tradesmanRegisterPage.submitEmailSignup();
    await tradesmanRegisterPage.expectPasswordError(
      /Passwords do not match/i,
    );
  });

  test("successful email signup redirects to /tradesman/signup/complete", async ({
    page,
    tradesmanRegisterPage,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomRegistration();
    await tradesmanRegisterPage.fillEmail(tradesman.email ?? "");
    await tradesmanRegisterPage.fillPassword(STRONG_PASSWORD);
    await tradesmanRegisterPage.fillConfirmPassword(STRONG_PASSWORD);
    await tradesmanRegisterPage.submitEmailSignup();
    await expect(page).toHaveURL(/\/tradesman\/signup\/complete/, {
      timeout: 15_000,
    });
  });
});
