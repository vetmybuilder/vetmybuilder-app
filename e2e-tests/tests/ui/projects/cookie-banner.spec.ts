import { test } from "../../../src/ui.base.fixtures";

test.describe("Cookie consent banner", () => {
  test("banner is visible on first visit and disappears after accept", async ({
    homePage,
    cookieBanner,
  }) => {
    await cookieBanner.clearConsentCookie();
    await homePage.goto();
    await cookieBanner.expectVisible();
    await cookieBanner.accept();
    await cookieBanner.expectHidden();
    await cookieBanner.expectConsentCookieSet();
  });

  test("banner does not appear when cookie is pre-set", async ({
    homePage,
    cookieBanner,
  }) => {
    await homePage.goto();
    await cookieBanner.expectHidden();
  });
});
