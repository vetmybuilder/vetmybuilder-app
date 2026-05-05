import { test } from "../../../src/ui.base.fixtures";

test.describe("Cookie consent banner", () => {
  test("banner shows on every route until accepted, then stays dismissed", async ({
    page,
    homePage,
    cookieBanner,
  }) => {
    await cookieBanner.clearConsentCookie();

    // 1. Layout-wrapped route (/) shows the banner
    await homePage.goto();
    await cookieBanner.expectVisible();

    // 2. Bare route (/projects/new bypasses Layout via NO_LAYOUT_PATHS in
    //    _app.tsx) — banner must still appear because it's mounted at the
    //    _app level, not inside Layout
    await page.goto("/projects/new");
    await cookieBanner.expectVisible();

    // 3. Accept persists the consent cookie and dismisses the banner
    await cookieBanner.accept();
    await cookieBanner.expectHidden();
    await cookieBanner.expectConsentCookieSet();

    // 4. Cookie persists across navigations - no re-prompt on the next route
    await page.goto("/cookies");
    await cookieBanner.expectHidden();
  });
});
