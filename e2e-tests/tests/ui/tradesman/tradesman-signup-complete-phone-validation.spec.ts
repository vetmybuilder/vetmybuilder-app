import { test } from "../../../src/ui.fixtures";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";

test.describe("Tradesman SSO signup — Step 1 inline validation", () => {
  test("empty required fields produce per-field errors", async ({
    page,
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await mockPostcodesIo(page);
    await tradesmanSignupCompletePage.goto();
    await tradesmanSignupCompletePage.expectVisible();
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

  test("invalid UK phone produces a phone-field error", async ({
    page,
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await mockPostcodesIo(page);
    await tradesmanSignupCompletePage.goto();
    await tradesmanSignupCompletePage.expectVisible();
    await tradesmanSignupCompletePage.fillStep1({
      companyName: "SSO Trades Co",
      contactName: "SSO Contact",
    });
    await tradesmanSignupCompletePage.addServiceArea("SW1A 1AA");
    await tradesmanSignupCompletePage.fillPhone("073534534535345355432534");
    await tradesmanSignupCompletePage.tryContinueFromStep1();

    await tradesmanSignupCompletePage.expectFieldError(
      "phone",
      /Enter a valid UK phone number/,
    );
  });

  test("valid UK phone clears the phone error", async ({
    page,
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await mockPostcodesIo(page);
    await tradesmanSignupCompletePage.goto();
    await tradesmanSignupCompletePage.expectVisible();
    await tradesmanSignupCompletePage.fillStep1({
      companyName: "SSO Trades Co",
      contactName: "SSO Contact",
    });
    await tradesmanSignupCompletePage.addServiceArea("SW1A 1AA");
    await tradesmanSignupCompletePage.fillPhone("073534534535345355432534");
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
