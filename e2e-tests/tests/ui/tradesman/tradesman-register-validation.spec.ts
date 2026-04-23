import { test } from "../../../src/ui.fixtures";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";

test.describe("Tradesman registration — Step 1 inline validation", () => {
  test("empty required fields produce per-field errors and no top banner", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    await authHelper.ensureGuest();
    await mockPostcodesIo(page);
    await tradesmanRegisterPage.goto();
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

  test("invalid UK phone produces a phone-field error", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    await authHelper.ensureGuest();
    await mockPostcodesIo(page);
    await tradesmanRegisterPage.goto();
    await tradesmanRegisterPage.fillStep1({
      companyName: "Test Co",
      contactName: "Chris Test",
      email: "chris.test@example.com",
    });
    await tradesmanRegisterPage.addServiceArea("E4 6");
    await tradesmanRegisterPage.fillPhone("09043535345322342342");
    await tradesmanRegisterPage.tryContinueFromStep1();

    await tradesmanRegisterPage.expectFieldError(
      "phone",
      /Enter a valid UK phone number/,
    );
  });

  test("valid UK phone clears the phone error", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    await authHelper.ensureGuest();
    await mockPostcodesIo(page);
    await tradesmanRegisterPage.goto();
    await tradesmanRegisterPage.fillStep1({
      companyName: "Test Co",
      contactName: "Chris Test",
      email: "chris.test@example.com",
    });
    await tradesmanRegisterPage.addServiceArea("E4 6");
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
