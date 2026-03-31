import type { Page } from "@playwright/test";

export async function mockPostcodesIo(page: Page): Promise<void> {
  await page.route(/api\.postcodes\.io/, async (route) => {
    const url: string = route.request().url();
    if (url.includes("/autocomplete")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: 200, result: [] }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: 200,
        result: {
          postcode: "SW1A 1AA",
          outcode: "SW1A",
          outward_code: "SW1A",
          incode: "1AA",
          inward_code: "1AA",
          admin_district: "Westminster",
          region: "London",
          country: "England",
          latitude: 51.5014,
          longitude: -0.1419,
        },
      }),
    });
  });
}
