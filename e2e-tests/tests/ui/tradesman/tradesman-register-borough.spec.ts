import { test } from "../../../src/ui.fixtures";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";
import { mockBoroughsApi } from "../../../src/helpers/BoroughsApiMock";

test.describe("Tradesman registration — borough service area", () => {
  test("selecting a borough adds a single chip and shows the covered postcodes", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    await authHelper.ensureGuest();
    await mockPostcodesIo(page);
    await mockBoroughsApi(page);
    await tradesmanRegisterPage.goto();

    await tradesmanRegisterPage.selectBoroughByName("waltham", "Waltham Forest");

    await tradesmanRegisterPage.expectServicePreview(
      "Covers: E4, E10, E11, E17",
    );
  });

  test("selecting a borough absorbs an individually-added overlapping outward", async ({
    page,
    authHelper,
    tradesmanRegisterPage,
  }) => {
    await authHelper.ensureGuest();
    await mockPostcodesIo(page);
    await mockBoroughsApi(page);
    await tradesmanRegisterPage.goto();

    await tradesmanRegisterPage.addServiceArea("E4 6");
    await tradesmanRegisterPage.expectChipVisible("E4");

    await tradesmanRegisterPage.selectBoroughByName("waltham", "Waltham Forest");

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
